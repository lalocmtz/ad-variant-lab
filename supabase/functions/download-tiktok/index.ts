import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
    if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY not configured");

    // Call RapidAPI TikTok Video Downloader
    const apiUrl = `https://tiktok-video-downloader-api.p.rapidapi.com/media?videoUrl=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "tiktok-video-downloader-api.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("RapidAPI error:", response.status, errText);
      throw new Error(`RapidAPI error: ${response.status}`);
    }

    const data = await response.json();
    console.log("RapidAPI response keys:", Object.keys(data));

    // Extract video URL from response
    const videoUrl = data?.data?.play || data?.data?.hdplay || data?.play || data?.hdplay;
    if (!videoUrl) {
      console.error("Full RapidAPI response:", JSON.stringify(data));
      throw new Error("Could not extract video URL from API response");
    }

    // Download the video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error("Failed to download video");
    const videoBlob = await videoResponse.arrayBuffer();

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `tiktok_${Date.now()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, videoBlob, { contentType: "video/mp4" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload video to storage");
    }

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(fileName);

    return new Response(JSON.stringify({
      video_url: publicUrlData.publicUrl,
      file_name: fileName,
      metadata: {
        title: data?.data?.title || data?.title || "",
        duration: data?.data?.duration || data?.duration || 0,
        author: data?.data?.author?.nickname || data?.author?.nickname || "",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("download-tiktok error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
