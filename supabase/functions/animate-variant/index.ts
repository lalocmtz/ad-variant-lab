import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, audio_url, prompt } = await req.json();
    if (!image_url) throw new Error("image_url is required");
    if (!audio_url) throw new Error("audio_url is required");

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");

    console.log("Creating Infinitalk animation task:", { image_url: image_url.substring(0, 80), audio_url: audio_url.substring(0, 80) });

    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "infinitalk/from-audio",
        input: {
          image_url,
          audio_url,
          prompt: prompt || "A person naturally talking while holding a product, casual TikTok style.",
          resolution: "720p",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Infinitalk error:", response.status, errText);
      throw new Error(`Infinitalk error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log("Infinitalk response:", JSON.stringify(data));

    if (data.code !== 200) {
      throw new Error(`Infinitalk error: ${data.msg || "Unknown"}`);
    }

    return new Response(JSON.stringify({ task_id: data.data.taskId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("animate-variant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
