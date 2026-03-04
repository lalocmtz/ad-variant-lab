import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Style variation descriptors (non-human, avoids safety filters)
const VARIANT_STYLES = [
  { setting: "warm golden hour lighting, wooden table surface", props: "a small potted succulent nearby" },
  { setting: "cool blue-toned morning light, marble countertop", props: "a glass of water with lemon nearby" },
  { setting: "soft pink sunset glow, clean white desk", props: "a folded towel nearby" },
  { setting: "bright natural daylight, light grey fabric background", props: "a small candle nearby" },
  { setting: "warm indoor lamplight, dark wood surface", props: "a ceramic cup nearby" },
];

function getVariantStyle(variantIndex: number) {
  return VARIANT_STYLES[variantIndex % VARIANT_STYLES.length];
}

function buildPrompt(
  basePrompt: string,
  sceneGeometry?: Record<string, string>,
  variantIndex?: number,
  totalVariants?: number,
): string {
  const idx = variantIndex ?? 0;
  const total = totalVariants ?? 3;
  const style = getVariantStyle(idx);

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

TASK: Generate a product-focused image inspired by the reference frame. Focus on the PRODUCT — do NOT include any people, faces, or body parts.

VARIANT STYLE FOR ${idx + 1}:
- Setting: ${style.setting}
- Props: ${style.props}

PRODUCT RULES:
- The product MUST be a pixel-perfect copy of the PRODUCT REFERENCE image.
- Do NOT redesign the package. Do NOT change colors, logo, label, shape, or typography.
- Product must be clearly visible, readable, and prominent.
- Product should be the hero of the image, centered and well-lit.

SCENE GEOMETRY:
${geometryBlock}
- Replicate a similar composition and framing as the reference frame.

STYLE:
- Photorealistic product photography style.
- Natural lighting, clean composition.
- Looks like a high-quality social media product shot.

OUTPUT: 9:16 vertical, maximum resolution, photorealistic.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: No people, no faces, no hands, no body parts, no text overlays, no logos other than on product, no watermarks, no distorted elements, no product redesign.`;
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
