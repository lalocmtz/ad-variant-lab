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
    const { image_prompt, scene_index, product_image_url, human_actions, camera_behavior, environment_context, product_interactions } = await req.json();

    if (!image_prompt) throw new Error("image_prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    const realismRules = `Generate an ultra-photorealistic vertical 9:16 image that looks exactly like a real TikTok UGC frame captured with an iPhone 15 Pro by a normal person.

This must look indistinguishable from a real smartphone video frame.

SCENE CONTEXT:
${image_prompt}

${human_actions ? `\nThe visual behavior MUST follow these extracted patterns from real TikTok references:\n\nHuman behavior:\n${human_actions}` : ""}

${camera_behavior ? `\nCamera behavior:\n${camera_behavior}` : ""}

${environment_context ? `\nEnvironment context:\n${environment_context}` : ""}

${product_interactions ? `\nProduct interaction:\n${product_interactions}` : ""}

============================
PHOTOREALISM REQUIREMENTS
============================

Camera:
iPhone 15 Pro rear camera
natural lens distortion
subtle handheld tilt
slightly imperfect framing
natural focus falloff

Lighting:
only natural lighting
window light
indoor ambient light
or golden hour sunlight

lighting must be imperfect:
slight highlight clipping
natural shadows
mild uneven exposure

Textures must be extremely detailed:
skin pores
fingerprint marks
fabric weave
dust particles
surface imperfections
micro scratches

Surfaces must look real:
wood grain
kitchen counter stone
bathroom ceramic
cloth fibers
plastic reflections

Human elements if present:
real hands only
visible veins
natural nail imperfections
realistic skin texture
minor skin redness or dryness

Hands must interact with the product naturally.

Composition:
slightly off-center framing
casual phone recording angle
not perfectly aligned
not studio photography

Background:
normal lived-in environment
subtle clutter allowed
household objects allowed
nothing staged or sterile

Color grading:
natural smartphone color science
warm neutral tones
not HDR
not oversaturated
not cinematic LUT

============================
PRODUCT ACCURACY
============================

The product must match the reference image EXACTLY.
shape
materials
colors
labels
packaging
logos
branding

The product must look physically real and consistent with the reference.

============================
STRICTLY FORBIDDEN
============================

NO studio photography
NO perfect product shots
NO commercial lighting
NO symmetrical compositions
NO artificial gradients
NO CGI look
NO smooth plastic textures
NO AI artifacts
NO extra fingers
NO warped objects
NO unrealistic reflections
NO unrealistic skin
NO text overlays of any kind
NO social media UI elements
NO subtitles or captions
NO watermarks or logos

The image must feel like a real TikTok frame grabbed from a phone recording.

If the viewer pauses the video, they should believe this was filmed by a real person.

If any visual element looks artificial, unrealistic, or AI-generated, regenerate the scene to ensure maximum realism.`;

    if (product_image_url) {
      content.push(
        { type: "text", text: realismRules + "\n\nThe product image below is the GROUND TRUTH. The generated product must be pixel-accurate to this reference — same packaging, same colors, same branding, same shape." },
        { type: "image_url", image_url: { url: product_image_url } },
      );
    } else {
      content.push({ type: "text", text: realismRules });
    }

    console.log(`[generate-broll-lab-image] Scene ${scene_index}: generating with PRO UGC prompt`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image gen error:", response.status, errText);

      if (response.status === 429 || response.status === 503) {
        console.log(`[generate-broll-lab-image] Pro model unavailable (${response.status}), falling back to flash`);
        const fallbackResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image-preview",
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
          }),
        });

        if (!fallbackResponse.ok) {
          const fbErr = await fallbackResponse.text();
          console.error("Fallback image gen error:", fallbackResponse.status, fbErr);
          throw new Error(`Image generation failed: ${fallbackResponse.status}`);
        }

        const fbResult = await fallbackResponse.json();
        const fbImageData = fbResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!fbImageData) throw new Error("No image generated (fallback)");

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const base64Part = fbImageData.split(",")[1] || fbImageData;
        const binaryStr = atob(base64Part);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const fileName = `broll_lab_scene_${scene_index}_${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("videos")
          .upload(fileName, bytes, { contentType: "image/png", upsert: true });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;
        console.log(`[generate-broll-lab-image] Scene ${scene_index} (fallback) uploaded:`, publicUrl);

        return new Response(JSON.stringify({ image_url: publicUrl, scene_index }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const result = await response.json();
    const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) throw new Error("No image generated");

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
