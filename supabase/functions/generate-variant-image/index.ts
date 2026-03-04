import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildStrictPrompt(
  basePrompt: string,
  sceneGeometry?: Record<string, string>,
  variantIndex?: number,
  totalVariants?: number,
  actorDescription?: string,
): string {
  const geometryBlock = sceneGeometry
    ? `
Observed camera distance: ${sceneGeometry.camera_distance || "medium_close"}
Product held in: ${sceneGeometry.product_hand || "right"} hand
Product position in frame: ${sceneGeometry.product_position || "center"}
Camera angle: ${sceneGeometry.camera_angle || "eye_level"}
Lighting direction: ${sceneGeometry.lighting_direction || "natural_ambient"}`
    : "";

  const diversityBlock = `
═══════════════════════════════════════════════════
CRITICAL DIVERSITY RULE
═══════════════════════════════════════════════════
This is VARIANT ${(variantIndex ?? 0) + 1} of ${totalVariants ?? 3}.
The person in this image MUST be COMPLETELY DIFFERENT from the original video actor.
The person MUST NOT resemble any other variant's actor.

MANDATORY ACTOR FOR THIS VARIANT:
${actorDescription || "A person with completely different ethnicity, age, and appearance from the original"}

Generate this EXACT person described above. Do NOT default to the original actor.
Do NOT generate a generic person. Follow the actor description PRECISELY.
═══════════════════════════════════════════════════`;

  return `STRICT SCENE RECONSTRUCTION — CLONE THE REFERENCE FRAME

You are receiving TWO reference images:
1. COVER FRAME — a real frame from the original TikTok video showing the exact scene, pose, camera angle, and composition to clone
2. PRODUCT IMAGE — the EXACT product packaging that MUST appear in the generated image

Your job is to RECREATE the EXACT SAME scene from the cover frame with a COMPLETELY DIFFERENT person (described below), holding the EXACT product from the product image.

${diversityBlock}

MANDATORY RULES (violating any = failure):

1. PRODUCT LOCK — USE THE PRODUCT IMAGE REFERENCE
The product in the generated image MUST be a pixel-perfect copy of the product shown in the PRODUCT IMAGE reference.
Do NOT redesign the package. Do NOT change colors, logo, label, shape, or typography.
Copy the product EXACTLY as it appears in the product reference image.

2. SCENE GEOMETRY LOCK — Match the COVER FRAME EXACTLY:
- Same camera distance and framing
- Same vertical 9:16 composition
- Same subject position in frame
- Same hand holding position and product placement
- Same perspective and depth
- Same lighting direction and quality
${geometryBlock}

3. POSE LOCK
The subject must hold the product in the EXACT same way as shown in the cover frame:
- Same hand (left/right)
- Same arm angle
- Same product orientation relative to camera
- Same proximity to camera
- Same gesture

4. IDENTITY CHANGE — THE MOST IMPORTANT RULE
The person MUST match this description EXACTLY: ${actorDescription || "completely different person"}
- DIFFERENT ethnicity from the original
- DIFFERENT age range from the original
- DIFFERENT hair style and color
- DIFFERENT facial features
Do NOT generate someone who looks similar to the original actor.

5. ULTRA REALISTIC UGC STYLE — MAXIMUM QUALITY
Must look like a real smartphone TikTok frame:
- Ultra-realistic, HIGH DEFINITION, 4K quality
- Natural, imperfect lighting
- Casual environment
- Handheld camera feel
- Authentic human skin texture with pores and natural imperfections
- Sharp detail on product packaging (must be readable)
- No studio lighting, no advertising aesthetic
- PHOTOREALISTIC quality — indistinguishable from a real photo

6. PRODUCT PRIORITY
Product must be clearly visible, readable, and prominent in the person's hand.
The product packaging must EXACTLY match the product reference image.

7. NATURAL SOCIAL MEDIA LOOK
This should look like a random real TikTok frame, not a staged advertisement.

CAMERA: Front smartphone camera, medium close shot, slight handheld realism, natural daylight.
OUTPUT: Maximum resolution, ultra-sharp, photorealistic, high-definition.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: Do NOT include any text overlays, logos, watermarks, extra hands, distorted fingers, or product redesign. Do NOT invent a different product packaging. Do NOT generate the same person as the original video.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, scene_geometry, cover_url, product_image_url, variant_index, total_variants, actor_description } = await req.json();
    if (!prompt) throw new Error("prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fullPrompt = buildStrictPrompt(prompt, scene_geometry, variant_index, total_variants, actor_description);

    // Build multimodal content with visual references
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
      actorDescription: actor_description?.substring(0, 80),
      hasCover: !!cover_url,
      hasProduct: !!product_image_url,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content },
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
