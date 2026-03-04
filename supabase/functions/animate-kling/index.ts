import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function uploadBase64ToStorage(base64DataUrl: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URL format");

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = mimeType.split("/")[1] || "png";
  const fileName = `kling-input-${crypto.randomUUID()}.${ext}`;

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("videos")
    .upload(fileName, bytes, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicData } = supabase.storage
    .from("videos")
    .getPublicUrl(fileName);

  return publicData.publicUrl;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { image_url, video_url, video_duration, video_mode, motion_prompt } = await req.json();

    const isNoAvatar = video_mode === "no_avatar";

    // Validate required fields based on mode
    if (!image_url) {
      return jsonResponse({ error: "image_url is required" }, 400);
    }
    if (!isNoAvatar && !video_url) {
      return jsonResponse({ error: "video_url is required for avatar mode" }, 400);
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return jsonResponse({ error: "KIE_API_KEY not configured" }, 500);
    }

    // Convert base64 data URL to public HTTP URL
    if (image_url.startsWith("data:")) {
      console.log("Detected base64 data URL, uploading to storage...");
      image_url = await uploadBase64ToStorage(image_url);
      console.log("Uploaded image, public URL:", image_url);
    }

    let payload: Record<string, unknown>;

    if (isNoAvatar) {
      // ── Sora2 Image-to-Video (no_avatar mode) ──
      const prompt = motion_prompt || "Smooth, cinematic product showcase with subtle camera movement. Natural lighting, photorealistic. No people, no faces.";

      payload = {
        model: "sora-2-image-to-video",
        input: {
          prompt,
          image_urls: [image_url],
          aspect_ratio: "portrait",
          n_frames: "10",
          remove_watermark: true,
        },
      };

      console.log("Sending Sora2 task to KIE AI:", JSON.stringify({ image_url, mode: "no_avatar" }));
    } else {
      // ── Kling Motion Control (avatar mode) ──
      if (video_duration && video_duration > 30) {
        return jsonResponse({
          error: "El video excede 30 segundos. Kling solo acepta videos de 3 a 30 segundos.",
        }, 422);
      }

      const videoExt = video_url.split("?")[0].split(".").pop()?.toLowerCase();
      if (videoExt === "webm") {
        return jsonResponse({
          error: "Formato de video no soportado (.webm). Kling requiere formato MP4.",
        }, 422);
      }

      payload = {
        model: "kling-2.6/motion-control",
        input: {
          prompt: `VISUAL REFERENCE: Strictly use the generated image for the subject's appearance, identity, and background styling.

MOTION REFERENCE: Strictly use the original TikTok video for all movement, pacing, and camera dynamics.

CORE OBJECTIVE: 1:1 Motion transfer. Replicate the exact motion, timing, facial expressions, and gesture rhythm from the reference video with absolute temporal stability.

CRITICAL CONSTRAINTS (TO PREVENT ARTIFACTS):
- STRICT TEMPORAL CONSISTENCY: Maintain absolute structural integrity of the face, body, and background across the entire video.
- NO MORPHING OR MELTING: Zero deformations during movement, camera zooms, or shot transitions.
- ZERO HALLUCINATIONS: Do not invent unnatural physics, extra limbs, or physically impossible movements. Hands and fingers must remain anatomically correct and stable at all times.
- PRODUCT STABILITY: The product held by the subject must remain solid; no warping, bending, or text shifting during movement.

PRESERVE FROM VIDEO:
- Camera distance and natural handheld smartphone movement.
- Gesture rhythm: natural conversational gesturing exactly as the driving video.
- Exact product interaction timing and hand positioning.
- Pacing: quick-paced, direct-to-camera testimonial.

PRESERVE FROM IMAGE:
- Actor identity (must look exactly like the VISUAL REFERENCE image).
- Background details (must exactly match the VISUAL REFERENCE image).

STYLE:
Raw, unretouched UGC TikTok style. Natural lighting. DO NOT add logos, text overlays, or artificial studio effects.`,
          input_urls: [image_url],
          video_urls: [video_url],
          character_orientation: "video",
          mode: "720p",
        },
      };

      console.log("Sending Kling task to KIE AI:", JSON.stringify({ image_url, video_url }));
    }

    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("KIE AI response:", JSON.stringify(data));

    if (!response.ok || (data.code && data.code !== 200)) {
      const errorMsg = data.msg || data.message || "KIE AI request failed";
      console.error("KIE AI error:", errorMsg);
      return jsonResponse({ error: errorMsg, details: data }, 422);
    }

    return jsonResponse({
      taskId: data.data?.taskId || data.taskId || data.data?.task_id,
    });
  } catch (error) {
    console.error("animate-kling error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});
