import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url, video_url } = await req.json();

    if (!image_url || !video_url) {
      return new Response(
        JSON.stringify({ error: "image_url and video_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "KIE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
