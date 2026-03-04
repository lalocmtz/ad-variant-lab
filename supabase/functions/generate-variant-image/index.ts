import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildStrictPrompt(basePrompt: string, sceneGeometry?: Record<string, string>): string {
  const geometryBlock = sceneGeometry
    ? `
Camera distance: ${sceneGeometry.camera_distance || "medium_close"}
Product held in: ${sceneGeometry.product_hand || "right"} hand
Product position in frame: ${sceneGeometry.product_position || "center"}
Camera angle: ${sceneGeometry.camera_angle || "eye_level"}
Lighting direction: ${sceneGeometry.lighting_direction || "natural_ambient"}`
    : "";

  return `STRICT SCENE RECONSTRUCTION

Recreate the exact same scene composition as the reference TikTok frame.

IMPORTANT RULES:

1. PRODUCT LOCK
The product packaging MUST be IDENTICAL to the reference product image provided.
Do NOT redesign the package.
Do NOT change colors, logo, label, bottle shape, or typography.
Use the exact same packaging as the reference image.

2. SCENE GEOMETRY LOCK
Replicate the same camera framing and composition as the original video frame:
- same camera distance
- same vertical 9:16 framing
- same subject position in frame
- same hand holding position
- same product placement
- same perspective
- same lighting direction
${geometryBlock}

3. POSE LOCK
The subject must hold the product in the exact same way:
- same hand position
- same arm angle
- same product orientation
- same proximity to camera
- same gesture

4. IDENTITY CHANGE ONLY
The ONLY things allowed to change:
- the person identity (different face, hair, age, ethnicity)
- subtle environment variation (same category of room but different details)
Do NOT change scene type.

5. ULTRA REALISTIC UGC STYLE
This must look like a real smartphone TikTok video frame:
- natural lighting
- imperfect realism
- casual environment
- handheld feel
- authentic human skin texture
- no studio lighting
- no advertising style

6. PRODUCT PRIORITY
The product must be clearly visible and readable in the person's hand.

7. NATURAL SOCIAL MEDIA LOOK
This should look like a random real TikTok frame, not an advertisement.

CAMERA STYLE
Front smartphone camera, medium close shot, slight handheld realism, natural daylight.

FINAL GOAL
This should look like the SAME TikTok video but with a different person.
Do not stylize. Do not redesign anything. Preserve realism.

VARIANT-SPECIFIC CONTEXT:
${basePrompt}

DO NOT include any text overlays in the image.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, scene_geometry } = await req.json();
    if (!prompt) throw new Error("prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fullPrompt = buildStrictPrompt(prompt, scene_geometry);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
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
