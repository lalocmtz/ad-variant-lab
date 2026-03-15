import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

NEGATIVE: No people, no faces, no hands, no body parts, no text overlays, no logos other than on product, no watermarks, no distorted elements, no product redesign, no on-screen text, no subtitles, no captions, no comment bubbles, no social media UI.`;
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
  isRegeneration?: boolean,
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
- Different jawline, eye shape, eyebrow structure, hairstyle, facial proportions
- The difference must be immediately noticeable at first glance`;

  const cleanupBlock = overlayCleanupRequired
    ? `\nSTEP 1 — FRAME CLEANUP (REQUIRED)
The reference frame contains social media overlays. You MUST:
- Remove all comment bubbles, usernames, timestamps, engagement icons, watermarks, UI frames, captions
- Reconstruct the raw underlying scene\n`
    : "";

  const regenBlock = isRegeneration
    ? `\nREGENERATION — STRONGER IDENTITY SWAP:
- Previous generation was too similar to original
- Generate a COMPLETELY NEW face identity from scratch
- Increase diversity: different face shape, jawline, eye structure
- Slightly loosen scene exactness to prioritize actor uniqueness
- Product lock remains ABSOLUTE\n`
    : "";

  const customNegative = negativePrompt || "No same actor identity, no nearly identical faces, no sibling-like similarity, no only wardrobe changes, no unrealistic product, no studio lighting, no cinematic commercial style, no stock photo appearance.";

  return `REFERENCE FRAME: See the attached cover frame image below.
PRODUCT REFERENCE: See the attached product image below.

This is VARIANT ${idx + 1} of ${total}.
${cleanupBlock}${regenBlock}
GOAL: Generate a realistic UGC-style vertical image that preserves the winning ad mechanics but uses a clearly different actor.

CREATOR CONSISTENCY RULE (MANDATORY):
Preserve the same creator role, same market fit, same trust profile, same gender presentation, and same broad audience plausibility as the original ad.
Do NOT change the creator category. The variant must feel like the same ad strategy expressed by a different plausible actor from the same market context.

MARKET PLAUSIBILITY:
Keep the same broad market context and creator-market fit as the original ad.
Do not arbitrarily shift the actor into an unrelated demographic presentation, unrelated phenotype, or unrelated creator vibe.
Preserve audience plausibility, not exact identity.

STAGE A — FRAME CLEANUP
Use the reference frame as structural guidance ONLY.
Remove any social media overlays, watermarks, captions, or UI elements.
Reconstruct the raw underlying scene.

STAGE B — SCENE RECONSTRUCTION
Preserve: camera angle, approximate framing, camera distance, lighting direction, gesture structure, action being performed.
Allow small variations in: furniture layout, wall tone, background details, decoration.
The scene should feel like the same TYPE of room but NOT an identical copy.
${geometryBlock}

STAGE C — ACTOR IDENTITY REPLACEMENT (CRITICAL)
Replace the original person with a COMPLETELY DIFFERENT individual.
GENERATE A NEW FACE IDENTITY from scratch.
The new actor must be CLEARLY different — the difference must be obvious at first glance.
${actorBlock}
${identityRulesBlock}

PRESERVE:
- exact uploaded product (shape, color, label, proportions, packaging)
- product interaction logic
- same action being performed
- same broad scene type
- approximate framing and camera distance
- natural handheld UGC realism
- winning hook energy
- same broad wardrobe logic if relevant
- same creator role and trust profile
- same creator-market fit

CHANGE:
- actor identity completely (face shape, jawline, eyebrows, eye shape, nose, lips, hairstyle, facial proportions)

FORBIDDEN:
- same face or similar face
- sibling-like similarity
- unrelated demographic drift
- arbitrary gender swap
- different creator archetype
- different audience context
- stock photo look, studio lighting, cinematic commercial look
- on-screen text, subtitles, captions, comment bubbles, social media UI, motion graphics

UGC REALISM: natural indoor lighting, handheld phone camera perspective, slightly imperfect framing, authentic creator posture, casual environment.

PRIORITY ORDER:
1. Exact product lock
2. Winning mechanics preserved
3. Creator role and trust profile preserved
4. New actor identity (HIGH distance)
5. Market plausibility
6. UGC realism

OUTPUT: 9:16 vertical, hyper-realistic, full HD, maximum texture realism. Clean raw UGC recording look — NO text overlays, NO graphics.

VARIANT CONTEXT:
${basePrompt}

NEGATIVE: ${customNegative}, no social media overlays, no watermarks, no UI elements, no identical scene copy, no same facial features, no clone-like result, no unrelated demographic shift, no incorrect product, no on-screen text, no subtitles, no captions, no comment bubbles, no floating text, no animated graphics, no stickers, no motion graphics, no different creator archetype, no different gender presentation unless requested.`;
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
  model: string = "google/gemini-2.5-flash-image",
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    console.log(`[img-gen] Calling model: ${model}`);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[img-gen] ${model} HTTP error:`, response.status, errText.substring(0, 500));
      if (response.status === 429) throw { status: 429, message: "Demasiadas solicitudes. Intenta de nuevo." };
      if (response.status === 402) throw { status: 402, message: "Créditos insuficientes." };
      return null;
    }

    const data = await response.json();

    // Check for in-stream rate limit errors
    const choiceError = data.choices?.[0]?.error;
    if (choiceError?.code === 429) {
      console.warn(`[img-gen] ${model} in-stream 429 rate limit`);
      return null;
    }

    // Try multiple response formats
    const msg = data.choices?.[0]?.message;
    let imageUrl = msg?.images?.[0]?.image_url?.url || null;

    // Fallback: check inline_data / parts pattern
    if (!imageUrl && msg?.content) {
      if (typeof msg.content === "string" && msg.content.startsWith("data:image")) {
        imageUrl = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "image_url" && part.image_url?.url) {
            imageUrl = part.image_url.url;
            break;
          }
          if (part.type === "image" && part.url) {
            imageUrl = part.url;
            break;
          }
        }
      }
    }

    console.log(`[img-gen] ${model} result: imageUrl=${imageUrl ? `found (${imageUrl.substring(0, 60)}...)` : "null"}, keys=${JSON.stringify(Object.keys(msg || {}))}`);
    return imageUrl;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError") {
      console.error("[img-gen] Timed out after 90s");
      throw new Error("Timeout: la generación de imagen tardó más de 90 segundos.");
    }
    throw e;
  }
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
      fullPrompt = buildPromptAvatar(
        prompt,
        scene_geometry,
        variant_index,
        total_variants,
        actor_visual_direction,
        negative_prompt,
        identity_replacement_rules,
        overlay_cleanup_required,
        is_regeneration,
      );
    }

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
      isRegeneration: !!is_regeneration,
    });

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
