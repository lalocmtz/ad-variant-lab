import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Style variation descriptors for product-only (no_avatar) mode
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

function buildPromptNoAvatar(
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

function buildPromptAvatar(
  basePrompt: string,
  sceneGeometry?: Record<string, string>,
  variantIndex?: number,
  totalVariants?: number,
  actorVisualDirection?: Record<string, string>,
  negativePrompt?: string,
  identityReplacementRules?: string[],
  overlayCleanupRequired?: boolean,
): string {
  const idx = variantIndex ?? 0;
  const total = totalVariants ?? 3;

  const geometryBlock = sceneGeometry
    ? `
Camera distance: ${sceneGeometry.camera_distance || "medium_close"}
Product held in: ${sceneGeometry.product_hand || "right"} hand
Product position: ${sceneGeometry.product_position || "center"}
Camera angle: ${sceneGeometry.camera_angle || "eye_level"}
Lighting direction: ${sceneGeometry.lighting_direction || "natural_ambient"}`
    : "";

  const actorBlock = actorVisualDirection
    ? `
ACTOR IDENTITY FOR THIS VARIANT (MUST BE A COMPLETELY DIFFERENT PERSON):
- Gender presentation: ${actorVisualDirection.gender_presentation || "not specified"}
- Age band: ${actorVisualDirection.approx_age_band || "not specified"}
- Face shape: ${actorVisualDirection.face_shape || "distinct from original"}
- Hair style: ${actorVisualDirection.hair_style || "different from original"}
- Hair color: ${actorVisualDirection.hair_color || "different from original"}
- Skin tone range: ${actorVisualDirection.skin_tone_range || "market-plausible"}
- Overall vibe: ${actorVisualDirection.overall_vibe || "authentic UGC creator"}
- Wardrobe: ${actorVisualDirection.wardrobe || "casual, different from original"}`
    : "";

  const identityRulesBlock = identityReplacementRules && identityReplacementRules.length > 0
    ? `\nIDENTITY REPLACEMENT RULES:\n${identityReplacementRules.map(r => `- ${r}`).join("\n")}`
    : `\nIDENTITY REPLACEMENT RULES:
- Generate a completely new face identity
- Do NOT preserve original facial structure
- Different jawline than original
- Different eye shape than original
- Different eyebrow structure than original
- Different hairstyle than original
- Different facial proportions than original
- The difference must be immediately noticeable at first glance`;

  const cleanupBlock = overlayCleanupRequired
    ? `\n-------------------------------------
STEP 1 — FRAME CLEANUP (REQUIRED)
The reference frame contains social media overlays. You MUST:
- Remove all comment bubbles, usernames, timestamps
- Remove all engagement icons, watermark logos
- Remove all colored UI frames and captions
- Reconstruct the raw underlying scene as it would appear without any social media UI
The result should look like the raw camera recording before upload.
-------------------------------------\n`
    : "";

  const customNegative = negativePrompt || "No same actor identity, no nearly identical faces, no sibling-like similarity, no only wardrobe changes, no unrealistic product, no studio lighting, no cinematic commercial style, no stock photo appearance.";

  return `REFERENCE FRAME: See the attached cover frame image below.
PRODUCT REFERENCE: See the attached product image below.

This is VARIANT ${idx + 1} of ${total}.
${cleanupBlock}
MULTI-STAGE IMAGE GENERATION PIPELINE:

STAGE A — FRAME CLEANUP
Use the reference frame as structural guidance ONLY.
Remove any social media overlays, watermarks, captions, or UI elements.
Reconstruct the raw underlying scene.

STAGE B — SCENE RECONSTRUCTION
Recreate the environment with high realism.
Preserve:
- Camera angle and approximate framing
- Camera distance and lighting direction
- Gesture structure and action being performed
Allow small variations in:
- Furniture layout and wall tone
- Background details and decoration
The scene should feel like the same TYPE of room but NOT an identical copy.
${geometryBlock}

STAGE C — ACTOR IDENTITY REPLACEMENT (CRITICAL)
Replace the original person with a COMPLETELY DIFFERENT individual.
GENERATE A NEW FACE IDENTITY from scratch.
The new actor must be CLEARLY different from the original — the difference must be obvious at first glance.
${actorBlock}
${identityRulesBlock}

PRODUCT RULES (ABSOLUTE TRUTH):
- The product MUST match the PRODUCT REFERENCE image exactly.
- Do NOT redesign the package. Do NOT change colors, logo, label, shape, or typography.
- Product must be clearly visible, readable, and prominent.
- The actor must hold the EXACT product from the reference.

WARDROBE & ACCESSORIES:
- Preserve clothing category, color, and style from the winning mechanic
- If accessories (watch, bracelet, lav mic) are part of the mechanic, preserve their logic
- Do not let accessories become identity anchors

UGC REALISM (CRITICAL):
- This MUST look like a real TikTok creator filming a product testimonial with a smartphone.
- Natural indoor lighting, handheld phone camera perspective
- Slightly imperfect framing, authentic creator posture
- Natural skin texture with pores and imperfections
- Casual environment, NOT a commercial, NOT a stock photo

PRIORITY ORDER:
1. Exact product lock (packaging identical to reference)
2. Winning mechanics preserved (framing, energy, intent, action)
3. New actor identity (genuinely different person — HIGH distance)
4. UGC realism (natural, smartphone-quality)

OUTPUT: 9:16 vertical, hyper-realistic, full HD vertical resolution, maximum texture realism.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: ${customNegative}, no social media overlays, no comment bubbles, no watermarks, no UI elements, no identical scene copy, no same facial features as original, no clone-like result.`;
}

async function urlToBase64DataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const contentType = res.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${base64}`;
}

async function callImageGeneration(
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>,
  apiKey: string,
): Promise<string | null> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    if (response.status === 429) throw { status: 429, message: "Demasiadas solicitudes. Intenta de nuevo." };
    if (response.status === 402) throw { status: 402, message: "Créditos insuficientes." };
    throw new Error(`Image generation error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      prompt,
      scene_geometry,
      cover_url,
      product_image_url,
      variant_index,
      total_variants,
      video_mode,
      actor_visual_direction,
      negative_prompt,
      identity_replacement_rules,
      overlay_cleanup_required,
      is_regeneration,
    } = await req.json();
    if (!prompt) throw new Error("prompt is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const mode = video_mode || "avatar";

    let fullPrompt: string;
    if (mode === "no_avatar") {
      fullPrompt = buildPromptNoAvatar(prompt, scene_geometry, variant_index, total_variants);
    } else {
      let enhancedPrompt = prompt;
      if (is_regeneration) {
        enhancedPrompt = `${prompt}\n\nREGENERATION ATTEMPT — STRONGER IDENTITY SWAP REQUIRED:\n- The previous generation was too similar to the original actor\n- Generate a COMPLETELY NEW face identity — do NOT reuse any facial features from previous attempts\n- Increase diversity pressure: different face shape, different jawline, different eye structure\n- Slightly loosen scene exactness to prioritize actor uniqueness\n- Product lock remains ABSOLUTE`;
      }
      fullPrompt = buildPromptAvatar(
        enhancedPrompt,
        scene_geometry,
        variant_index,
        total_variants,
        actor_visual_direction,
        negative_prompt,
        identity_replacement_rules,
        overlay_cleanup_required,
      );
    }

    // Convert external image URLs to base64 data URIs for reliable AI gateway access
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: fullPrompt },
    ];

    if (cover_url) {
      try {
        console.log("Converting cover image to base64...");
        const coverDataUri = await urlToBase64DataUri(cover_url);
        console.log("Cover image converted, length:", coverDataUri.length);
        content.push({ type: "image_url", image_url: { url: coverDataUri } });
      } catch (e) {
        console.warn("Failed to convert cover URL to base64, using raw URL:", e);
        content.push({ type: "image_url", image_url: { url: cover_url } });
      }
    }
    if (product_image_url) {
      try {
        console.log("Converting product image to base64...");
        const productDataUri = await urlToBase64DataUri(product_image_url);
        console.log("Product image converted, length:", productDataUri.length);
        content.push({ type: "image_url", image_url: { url: productDataUri } });
      } catch (e) {
        console.warn("Failed to convert product URL to base64, using raw URL:", e);
        content.push({ type: "image_url", image_url: { url: product_image_url } });
      }
    }

    console.log("Generating variant image:", {
      variantIndex: variant_index,
      totalVariants: total_variants,
      videoMode: mode,
      hasCover: !!cover_url,
      hasProduct: !!product_image_url,
      hasActorDirection: !!actor_visual_direction,
      hasIdentityRules: !!identity_replacement_rules,
      overlayCleanup: !!overlay_cleanup_required,
      isRegeneration: !!is_regeneration,
    });

    // Attempt generation with 1 automatic retry on empty response
    let imageUrl = await callImageGeneration(content, LOVABLE_API_KEY);

    if (!imageUrl) {
      console.warn("First attempt returned no image, retrying...");
      imageUrl = await callImageGeneration(content, LOVABLE_API_KEY);
    }

    if (!imageUrl) {
      throw new Error("No se generó imagen después de 2 intentos");
    }

    return new Response(JSON.stringify({ image_url: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-variant-image error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
