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

  // Extract mime type and base64 data
  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URL format");

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = mimeType.split("/")[1] || "png";
  const fileName = `kling-input-${crypto.randomUUID()}.${ext}`;

  // Decode base64 to Uint8Array
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { image_url, video_url, video_duration } = await req.json();

    if (!image_url || !video_url) {
      return new Response(
        JSON.stringify({ error: "image_url and video_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate video duration (Kling accepts 3-30 seconds)
    if (video_duration && video_duration > 30) {
      return new Response(
        JSON.stringify({ error: "El video excede 30 segundos. Kling solo acepta videos de 3 a 30 segundos." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "KIE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert base64 data URL to public HTTP URL
    if (image_url.startsWith("data:")) {
      console.log("Detected base64 data URL, uploading to storage...");
      image_url = await uploadBase64ToStorage(image_url);
      console.log("Uploaded image, public URL:", image_url);
    }

    const payload = {
      model: "kling-2.6/motion-control",
      input: {
        prompt: `VISUAL REFERENCE: use the generated image.
MOTION REFERENCE: use the original TikTok video.

Replicate the exact motion, timing, and gesture rhythm from the reference video.
The actor is different but the behavior must match the original performance.

Preserve:
- camera distance: medium close-up
- gesture rhythm: natural conversational gesturing with the right hand
- product interaction timing: product is held steadily in frame from the start
- pacing and beat structure: quick-paced, direct-to-camera testimonial
- hand used: left hand holds the product
- product orientation: upright, facing camera

Replace:
- actor identity (different person)
- background details (same category of environment, subtle variations only)

Maintain a natural handheld TikTok style.
Do not add logos or new text overlays.`,
        input_urls: [image_url],
        video_urls: [video_url],
        character_orientation: "video",
        mode: "720p",
      },
    };

    console.log("Sending task to KIE AI:", JSON.stringify({ image_url, video_url }));

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

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.message || "KIE AI request failed", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ taskId: data.data?.taskId || data.taskId || data.data?.task_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("animate-kling error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
