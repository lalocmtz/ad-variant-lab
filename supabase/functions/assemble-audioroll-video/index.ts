import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Cloudinary helpers ── */

function cloudinaryAuth() {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const key = Deno.env.get("CLOUDINARY_API_KEY");
  const secret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloud || !key || !secret) throw new Error("Faltan credenciales de Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  return { cloud, key, secret };
}

async function uploadToCloudinary(
  url: string,
  cloud: string,
  key: string,
  secret: string,
  resourceType: "video" | "raw" = "video",
  folder = "audioroll",
): Promise<{ public_id: string; secure_url: string; duration?: number }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}${secret}`;
  const msgBuffer = new TextEncoder().encode(paramsToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const signature = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

  const form = new FormData();
  form.append("file", url);
  form.append("api_key", key);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Cloudinary upload error:", res.status, errText);
    throw new Error(`Cloudinary upload failed: ${res.status}`);
  }

  return await res.json();
}

/**
 * Build a Cloudinary video URL that concatenates clips and overlays audio.
 *
 * Strategy:
 *   1. Upload all clips + audio to Cloudinary
 *   2. Build a concatenation manifest using splice overlays
 *   3. Overlay the audio track
 *   4. Return the eager-transformed URL
 *
 * Cloudinary splice syntax:
 *   /l_video:<public_id>/fl_splice,du_<seconds>/fl_layer_apply/
 *
 * Audio overlay:
 *   /l_video:<audio_public_id>/fl_layer_apply/
 */

interface TimelineEntry {
  clip_index: number;
  source_url: string;
  trim_start: number;
  trim_end: number;
  timeline_start: number;
  timeline_end: number;
  beat: string;
}

function buildTimelineFromClips(
  clipUrls: string[],
  targetDuration: number,
): TimelineEntry[] {
  if (clipUrls.length === 0) return [];

  const beatDuration = 3.0; // ~3s per beat
  const totalBeats = Math.max(1, Math.round(targetDuration / beatDuration));
  const actualBeatDur = targetDuration / totalBeats;

  const timeline: TimelineEntry[] = [];
  let currentTime = 0;

  for (let i = 0; i < totalBeats; i++) {
    const clipIdx = i % clipUrls.length;
    const beatLabel = i === 0 ? "hook" : i === totalBeats - 1 ? "cta" : "body";
    const end = Math.min(currentTime + actualBeatDur, targetDuration);

    timeline.push({
      clip_index: clipIdx,
      source_url: clipUrls[clipIdx],
      trim_start: 0,
      trim_end: +(end - currentTime).toFixed(2),
      timeline_start: +currentTime.toFixed(2),
      timeline_end: +end.toFixed(2),
      beat: beatLabel,
    });

    currentTime = end;
  }

  return timeline;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cloud, key, secret } = cloudinaryAuth();

    const body = await req.json();
    const {
      job_id,
      user_id,
      voice_url,
      broll_clips,
      target_duration = 15,
    } = body;

    if (!voice_url) throw new Error("voice_url is required");
    if (!broll_clips || broll_clips.length === 0) throw new Error("broll_clips[] is required");

    console.log("AudioRoll assembly start:", { job_id, clips: broll_clips.length, target_duration });

    // 1. Build timeline
    const timeline = buildTimelineFromClips(broll_clips, target_duration);
    console.log("Timeline:", JSON.stringify(timeline));

    // 2. Upload all unique clips to Cloudinary
    const uniqueUrls = [...new Set(broll_clips as string[])];
    const uploadedClips: Record<string, { public_id: string; secure_url: string; duration?: number }> = {};

    for (const url of uniqueUrls) {
      console.log("Uploading clip to Cloudinary:", url.slice(0, 80));
      const result = await uploadToCloudinary(url, cloud, key, secret, "video", "audioroll/clips");
      uploadedClips[url] = result;
      console.log("Uploaded:", result.public_id, "duration:", result.duration);
    }

    // 3. Upload audio to Cloudinary
    console.log("Uploading voice audio to Cloudinary...");
    const audioResult = await uploadToCloudinary(voice_url, cloud, key, secret, "video", "audioroll/audio");
    console.log("Audio uploaded:", audioResult.public_id);

    // 4. Build concatenated video using Cloudinary's splice transformations
    // Base clip is the first one in timeline
    const firstEntry = timeline[0];
    const firstClip = uploadedClips[firstEntry.source_url];

    // Build transformation chain
    const transformations: string[] = [];

    // Trim first clip
    transformations.push(`so_0,eo_${firstEntry.trim_end}`);
    // Force 9:16 aspect ratio
    transformations.push("c_fill,ar_9:16,w_1080,h_1920");

    // Splice remaining clips
    for (let i = 1; i < timeline.length; i++) {
      const entry = timeline[i];
      const clip = uploadedClips[entry.source_url];
      // Encode public_id: replace / with :
      const encodedId = clip.public_id.replace(/\//g, ":");
      transformations.push(
        `l_video:${encodedId},so_0,eo_${entry.trim_end},c_fill,ar_9:16,w_1080,h_1920/fl_splice/fl_layer_apply`
      );
    }

    // Overlay audio (replace original audio)
    const encodedAudioId = audioResult.public_id.replace(/\//g, ":");
    transformations.push(
      `l_video:${encodedAudioId}/fl_layer_apply`
    );

    // Force output format
    const transformationStr = transformations.join("/");
    const finalUrl = `https://res.cloudinary.com/${cloud}/video/upload/${transformationStr}/${firstClip.public_id}.mp4`;

    console.log("Final Cloudinary URL:", finalUrl);

    // 5. Verify the URL is accessible (trigger Cloudinary rendering)
    const verifyRes = await fetch(finalUrl, { method: "HEAD" });
    console.log("Verify status:", verifyRes.status);

    // If Cloudinary returns 423 (still processing) or timeout, we still return the URL
    // The client can poll or use it directly
    const isReady = verifyRes.ok;

    // 6. Optionally store in Supabase storage for permanence
    let storedUrl = finalUrl;
    if (isReady) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const videoResponse = await fetch(finalUrl);
        if (videoResponse.ok) {
          const videoBuffer = await videoResponse.arrayBuffer();
          const fileName = `audioroll_final_${job_id || Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;

          const { error: uploadErr } = await sb.storage.from("videos").upload(fileName, videoBuffer, {
            contentType: "video/mp4",
            upsert: false,
          });

          if (!uploadErr) {
            const { data: urlData } = sb.storage.from("videos").getPublicUrl(fileName);
            storedUrl = urlData.publicUrl;
            console.log("Stored in Supabase:", storedUrl);
          } else {
            console.warn("Supabase storage upload failed, using Cloudinary URL:", uploadErr.message);
          }
        }
      } catch (storeErr) {
        console.warn("Failed to store in Supabase, using Cloudinary URL:", storeErr);
      }
    }

    return new Response(JSON.stringify({
      final_video_url: storedUrl,
      cloudinary_url: finalUrl,
      is_ready: isReady,
      timeline,
      total_duration: target_duration,
      clips_used: Object.keys(uploadedClips).length,
      provider: "cloudinary",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("assemble-audioroll-video error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Assembly failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
