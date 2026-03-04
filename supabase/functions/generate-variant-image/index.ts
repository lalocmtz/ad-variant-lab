import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Unique physical descriptors per variant to force visual diversity
const VARIANT_DESCRIPTORS = [
  {
    face: "slightly rounder face shape, thicker and bushier eyebrows, wider nose bridge, fuller cheeks",
    hair: "wavy textured hair, slightly longer on top",
    distinguishing: "a small beauty mark near the left cheek",
  },
  {
    face: "angular jawline with a defined chin, thinner arched eyebrows, narrower almond-shaped eyes, thinner lips",
    hair: "straight sleek hair, closely cropped sides",
    distinguishing: "slightly more prominent forehead, subtle dimples",
  },
  {
    face: "softer oval face shape, fuller and more defined lips, higher cheekbones, rounder eyes",
    hair: "curly voluminous hair, medium length",
    distinguishing: "light freckles across the nose bridge",
  },
  {
    face: "square face shape, heavy-set brow ridge, broad flat nose, wide-set eyes",
    hair: "short tightly coiled hair, fade on sides",
    distinguishing: "strong jawline with a cleft chin",
  },
  {
    face: "heart-shaped face, delicate pointed chin, large expressive eyes, small upturned nose",
    hair: "long flowing straight hair, side-parted",
    distinguishing: "high arched eyebrows, subtle laugh lines",
  },
];

function getVariantDescriptor(variantIndex: number) {
  return VARIANT_DESCRIPTORS[variantIndex % VARIANT_DESCRIPTORS.length];
}

function buildPrompt(
  basePrompt: string,
  sceneGeometry?: Record<string, string>,
  variantIndex?: number,
  totalVariants?: number,
): string {
  const idx = variantIndex ?? 0;
  const total = totalVariants ?? 3;
  const descriptor = getVariantDescriptor(idx);

  const geometryBlock = sceneGeometry
    ? `
Camera distance: ${sceneGeometry.camera_distance || "medium_close"}
Product held in: ${sceneGeometry.product_hand || "right"} hand
Product position: ${sceneGeometry.product_position || "center"}
Camera angle: ${sceneGeometry.camera_angle || "eye_level"}
Lighting direction: ${sceneGeometry.lighting_direction || "natural_ambient"}`
    : "";

  return `REFERENCE FRAME: See the attached cover frame image below.
PRODUCT REFERENCE: See the attached product image below.

This is VARIANT ${idx + 1} of ${total}.

TASK: Generate a highly realistic variant of this exact scene, but replace the subject with a COMPLETELY DIFFERENT person of the EXACT SAME demographic profile.

CRITICAL DIFFERENTIATION RULE:
- This variant MUST look COMPLETELY DIFFERENT from all other variants.
- Do NOT reuse the same face, hair, or features from the original or any other variant.
- Each variant number (${idx + 1}) maps to a UNIQUE set of physical traits listed below. You MUST follow them precisely.

MANDATORY PHYSICAL TRAITS FOR VARIANT ${idx + 1}:
- Face structure: ${descriptor.face}
- Hair: ${descriptor.hair}
- Distinguishing features: ${descriptor.distinguishing}

DEMOGRAPHIC CONSTRAINTS (CRITICAL):
- Match the EXACT ethnicity and skin tone of the original person. (e.g., if the original is a young Latino male, the generated person MUST be a young Latino male).
- Match the EXACT age group.
- Match the EXACT gender.
- Hair style and color should be natural and appropriate for the demographic, but MUST differ from the original.

STYLE & REALISM (UGC STYLE — CRITICAL):
- This MUST look like a raw, unretouched smartphone selfie video frame (TikTok style).
- AVOID studio lighting, AVOID overly perfect flawless skin, AVOID professional bokeh.
- Maintain the EXACT same background environment, lighting quality, and camera distance as the reference frame.
- Include natural skin imperfections: pores, slight blemishes, uneven skin tone.
- Slightly soft focus, natural color grading, no post-processing look.

SCENE GEOMETRY LOCK:
${geometryBlock}
- Replicate the exact composition, framing, and pose from the reference frame.
- Same hand holding the product, same arm angle, same product orientation.

PRODUCT LOCK:
- The product in the generated image MUST be a pixel-perfect copy of the PRODUCT REFERENCE image.
- Do NOT redesign the package. Do NOT change colors, logo, label, shape, or typography.
- Product must be clearly visible, readable, and prominent.

CAMERA: Front smartphone camera, medium close shot, slight handheld realism, natural daylight.
OUTPUT: 9:16 vertical, maximum resolution, photorealistic.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: No text overlays, no logos, no watermarks, no extra hands, no distorted fingers, no product redesign, no studio lighting, no stock photo aesthetic, no plastic skin.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, scene_geometry, cover_url, product_image_url, variant_index, total_variants } = await req.json();
    if (!prompt) throw new Error("prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fullPrompt = buildPrompt(prompt, scene_geometry, variant_index, total_variants);

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: fullPrompt },
    ];

    if (cover_url) {
      content.push({ type: "image_url", image_url: { url: cover_url } });
    }
    if (product_image_url) {
      content.push({ type: "image_url", image_url: { url: product_image_url } });
    }

    console.log("Generating variant image:", {
      variantIndex: variant_index,
      totalVariants: total_variants,
      hasCover: !!cover_url,
      hasProduct: !!product_image_url,
      descriptor: getVariantDescriptor(variant_index ?? 0),
    });

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
