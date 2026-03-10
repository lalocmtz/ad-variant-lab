import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, prompt_text, format_id } = await req.json();

    if (!image_url) throw new Error("image_url is required");

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");

    // Base64 images: upload to storage first to get a public URL
    let publicImageUrl = image_url;
    if (image_url.startsWith("data:")) {
      console.log("BOF video: converting base64 image to public URL via storage upload");
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const commaIdx = image_url.indexOf(",");
      if (commaIdx === -1) throw new Error("Invalid base64 image format");
      const header = image_url.substring(5, commaIdx);
      const mimeType = header.split(";")[0] || "image/png";
      const base64Data = image_url.substring(commaIdx + 1);
      const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      const fileName = `bof_video_input_${Date.now()}.${ext}`;

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { error: uploadError } = await supabaseAdmin.storage
        .from("videos")
        .upload(fileName, bytes, { contentType: mimeType, upsert: true });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      publicImageUrl = `${SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
      console.log("BOF video: uploaded to", publicImageUrl);
    }

    const sanitizedPrompt = (prompt_text || `Animate this product image with subtle handheld camera motion. Slow zoom in, gentle pan, and natural lighting shifts. Keep it looking like a real TikTok creator recording. 9:16 vertical. No text, no overlays, no graphics. Clean video only. Duration: approximately 9 seconds. Mexican Spanish visual context.`).substring(0, 9500);

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

    console.log("BOF video generation (Sora 2):", { format_id, imageUrlPreview: publicImageUrl.substring(0, 80) });

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
    try { data = JSON.parse(responseText); } catch { throw new Error("Invalid response from video provider"); }

    if (!response.ok) throw new Error(`Video generation failed: HTTP ${response.status}`);

    const kieCode = (data as any).code;
    if (kieCode !== undefined && kieCode !== 200) {
      throw new Error(`Video provider error (code ${kieCode}): ${(data as any).msg || "unknown"}`);
    }

    const taskId = (data as any).data?.taskId || (data as any).taskId || (data as any).data?.task_id || (data as any).task_id;
    if (!taskId) throw new Error("No taskId returned from video provider");

    return new Response(JSON.stringify({ taskId, status: "queued" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-bof-video error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error generating BOF video" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
