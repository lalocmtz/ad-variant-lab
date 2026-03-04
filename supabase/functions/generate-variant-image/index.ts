import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildStrictPrompt(basePrompt: string, sceneGeometry?: Record<string, string>): string {
  const geometryBlock = sceneGeometry
    ? `
Observed camera distance: ${sceneGeometry.camera_distance || "medium_close"}
Product held in: ${sceneGeometry.product_hand || "right"} hand
Product position in frame: ${sceneGeometry.product_position || "center"}
Camera angle: ${sceneGeometry.camera_angle || "eye_level"}
Lighting direction: ${sceneGeometry.lighting_direction || "natural_ambient"}`
    : "";

  return `STRICT SCENE RECONSTRUCTION — CLONE THE REFERENCE FRAME

You are receiving a reference frame from a TikTok video. Your job is to RECREATE the EXACT SAME scene with a DIFFERENT person only.

MANDATORY RULES (violating any = failure):

1. PRODUCT LOCK
The product packaging MUST be IDENTICAL to what appears in the reference frame.
Do NOT redesign the package. Do NOT change colors, logo, label, bottle shape, or typography.
Copy the product EXACTLY as it appears.

2. SCENE GEOMETRY LOCK — Match the reference frame EXACTLY:
- Same camera distance and framing
- Same vertical 9:16 composition
- Same subject position in frame
- Same hand holding position and product placement
- Same perspective and depth
- Same lighting direction and quality
${geometryBlock}

3. POSE LOCK
The subject must hold the product in the EXACT same way as the reference:
- Same hand (left/right)
- Same arm angle
- Same product orientation relative to camera
- Same proximity to camera
- Same gesture

4. IDENTITY CHANGE ONLY
The ONLY changes allowed:
- Different person (face, hair, age, ethnicity)
- Subtle environment variation (same category — if living room, still living room)
Do NOT change scene type, camera angle, or product.

5. ULTRA REALISTIC UGC STYLE
Must look like a real smartphone TikTok frame:
- Natural, imperfect lighting
- Casual environment
- Handheld camera feel
- Authentic human skin texture
- No studio lighting, no advertising aesthetic

6. PRODUCT PRIORITY
Product must be clearly visible, readable, and prominent in the person's hand.

7. NATURAL SOCIAL MEDIA LOOK
This should look like a random real TikTok frame, not a staged advertisement.

CAMERA: Front smartphone camera, medium close shot, slight handheld realism, natural daylight.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: Do NOT include any text overlays, logos, watermarks, extra hands, distorted fingers, or product redesign.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, scene_geometry } = await req.json();
    if (!prompt) throw new Error("prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fullPrompt = buildStrictPrompt(prompt, scene_geometry);

    // Note: video URLs (.mp4) cannot be passed as image_url — only PNG/JPEG/WebP/GIF supported.
    // The prompt contains all scene geometry data extracted by Gemini from the video analysis step.
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          { role: "user", content: fullPrompt },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image generation error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Image generation error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No se generó imagen");
    }

    return new Response(JSON.stringify({ image_url: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-variant-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
