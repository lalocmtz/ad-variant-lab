import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

async function uploadBase64ToStorage(image_url: string, scene_index: number): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const commaIdx = image_url.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid base64 image format");
  const header = image_url.substring(5, commaIdx);
  const mimeType = header.split(";")[0] || "image/png";
  const base64Data = image_url.substring(commaIdx + 1);
  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const fileName = `bof_scene_${Date.now()}_${scene_index || 0}.${ext}`;

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("videos")
    .upload(fileName, bytes, { contentType: mimeType, upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  return `${SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
}

// ── KIE (primary) ──

async function tryKie(publicImageUrl: string, sanitizedPrompt: string, KIE_API_KEY: string): Promise<{ taskId: string; engine: string }> {
  const requestBody = {
    model: "sora-2-image-to-video",
    input: {
      prompt: sanitizedPrompt,
      image_urls: [publicImageUrl],
      aspect_ratio: "portrait",
      n_frames: "10",
      remove_watermark: true,
    },
  };

  const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(responseText); } catch { throw new Error("Invalid KIE response"); }

  if (!response.ok) throw new Error(`KIE HTTP ${response.status}: ${responseText.substring(0, 200)}`);

  const kieCode = (data as any).code;
  if (kieCode !== undefined && kieCode !== 200) {
    throw new Error(`KIE error (code ${kieCode}): ${(data as any).msg || "unknown"}`);
  }

  const taskId = (data as any).data?.taskId || (data as any).taskId || (data as any).data?.task_id;
  if (!taskId) throw new Error("No taskId from KIE");

  return { taskId, engine: "kie" };
}

// ── fal.ai (fallback) ──

async function tryFal(publicImageUrl: string, sanitizedPrompt: string, FAL_API_KEY: string): Promise<{ taskId: string; engine: string }> {
  const requestBody = {
    input: {
      prompt: sanitizedPrompt,
      image_url: publicImageUrl,
      duration: 8,
      aspect_ratio: "9:16",
      resolution: "720p",
      model: "sora-2",
      delete_video: false,
    },
  };

  const response = await fetch("https://queue.fal.run/fal-ai/sora-2/image-to-video", {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(responseText); } catch { throw new Error("Invalid fal.ai response"); }

  if (!response.ok) throw new Error(`fal.ai HTTP ${response.status}: ${responseText.substring(0, 300)}`);

  const requestId = (data as any).request_id;
  if (!requestId) throw new Error("No request_id from fal.ai");

  // Prefix with "fal:" so polling knows which provider to query
  return { taskId: `fal:${requestId}`, engine: "fal" };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, motion_prompt, scene_index } = await req.json();
    if (!image_url) throw new Error("image_url is required");

    // Resolve public URL
    let publicImageUrl = image_url;
    if (image_url.startsWith("data:")) {
      console.log("[animate-bof-scene] Converting base64 to public URL");
      publicImageUrl = await uploadBase64ToStorage(image_url, scene_index);
      console.log("[animate-bof-scene] Uploaded to:", publicImageUrl);
    }

    const defaultPrompt = "Subtle handheld camera motion. Slow zoom in with gentle drift. Natural lighting. Keep product sharp and clearly visible. Smooth cinematic movement. Duration: approximately 9 seconds. No text, no overlays, no graphics. Clean UGC smartphone recording style.";
    const sanitizedPrompt = (motion_prompt || defaultPrompt).substring(0, 2000);

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    const FAL_API_KEY = Deno.env.get("FAL_API_KEY");

    // Strategy: Try KIE first → fallback to fal.ai
    let result: { taskId: string; engine: string } | null = null;
    let lastError = "";

    if (KIE_API_KEY) {
      try {
        console.log("[animate-bof-scene] Trying KIE (primary)…");
        result = await tryKie(publicImageUrl, sanitizedPrompt, KIE_API_KEY);
        console.log("[animate-bof-scene] ✓ KIE success:", result.taskId);
      } catch (e: any) {
        lastError = e?.message || "KIE failed";
        console.warn("[animate-bof-scene] KIE failed:", lastError);
      }
    }

    if (!result && FAL_API_KEY) {
      try {
        console.log("[animate-bof-scene] Trying fal.ai (fallback)…");
        result = await tryFal(publicImageUrl, sanitizedPrompt, FAL_API_KEY);
        console.log("[animate-bof-scene] ✓ fal.ai success:", result.taskId);
      } catch (e: any) {
        lastError = e?.message || "fal.ai failed";
        console.error("[animate-bof-scene] fal.ai also failed:", lastError);
      }
    }

    if (!result) {
      throw new Error(`All video providers failed. Last error: ${lastError}`);
    }

    return new Response(JSON.stringify({
      taskId: result.taskId,
      status: "queued",
      engine: result.engine,
      public_image_url: publicImageUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[animate-bof-scene] error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error animating scene" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
