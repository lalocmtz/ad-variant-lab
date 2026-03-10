import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_prompt, scene_index, product_image_url } = await req.json();

    if (!image_prompt) throw new Error("image_prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Build content with product image reference if available
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (product_image_url) {
      content.push(
        { type: "text", text: `Generate a hyper-realistic 9:16 vertical product photo based on this prompt. Use the product image below as the EXACT reference for the product's appearance. The generated image must match the product packaging, colors, and branding exactly.\n\nPrompt: ${image_prompt}\n\nCRITICAL RULES:\n- NO text overlays\n- NO social media UI\n- NO subtitles\n- NO watermarks\n- Hyper-realistic smartphone UGC style\n- 9:16 vertical orientation\n- Product must match the reference image exactly` },
        { type: "image_url", image_url: { url: product_image_url } },
      );
    } else {
      content.push({
        type: "text",
        text: `Generate a hyper-realistic 9:16 vertical product photo.\n\nPrompt: ${image_prompt}\n\nCRITICAL RULES:\n- NO text overlays\n- NO social media UI\n- NO subtitles\n- NO watermarks\n- Hyper-realistic smartphone UGC style\n- 9:16 vertical orientation`,
      });
    }

    console.log(`[generate-broll-lab-image] Scene ${scene_index}: generating image`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image gen error:", response.status, errText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const result = await response.json();
    const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) throw new Error("No image generated");

    // Upload to storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const base64Part = imageData.split(",")[1] || imageData;
    const binaryStr = atob(base64Part);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const fileName = `broll_lab_scene_${scene_index}_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
    console.log(`[generate-broll-lab-image] Scene ${scene_index} uploaded:`, publicUrl);

    return new Response(JSON.stringify({ image_url: publicUrl, scene_index }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-broll-lab-image error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error generating image" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
