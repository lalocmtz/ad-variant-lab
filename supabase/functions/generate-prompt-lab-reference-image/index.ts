import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ══════════════════════════════════════════════════════════════
   MASTER PROMPT — Single Source of Truth (server-side copy)
   Keep in sync with src/lib/referenceImagePrompt.ts
   ══════════════════════════════════════════════════════════════ */

const MASTER_PROMPT = `ULTRA REALISTIC smartphone selfie reference photo for a UGC-style TikTok product video.

Create a hyperrealistic vertical smartphone photo that looks exactly like a real iPhone front-camera capture from a beauty or lifestyle content creator filming at home. The image must feel like authentic user generated content, not advertising, not editorial, not studio photography.

=== CORE VISUAL GOAL ===
This image will be used as the primary visual anchor for video generation. It must look indistinguishable from a real smartphone photo posted by a creator on TikTok.

=== SUBJECT / CREATOR ===
A real-looking female content creator, early 20s to early 30s, naturally attractive but not model-like, authentic facial proportions, natural skin texture, visible pores, subtle asymmetry, realistic under-eye area, realistic lips, realistic eyebrows, minimal makeup or clean natural beauty look. She should feel like a believable everyday TikTok creator, not a commercial beauty model.

=== CAMERA / CAPTURE STYLE ===
Shot on iPhone front camera.
Natural handheld framing.
Slightly imperfect real-life composition.
Smartphone selfie perspective.
Subtle lens distortion from close front camera capture.
No cinematic composition.
No polished campaign framing.
Must feel casual, immediate, organic, and native to social media.

=== LIGHTING ===
Soft real daylight from a nearby window.
Natural shadows.
No studio lighting.
No glam lighting.
No dramatic lighting.
No artificial ad-style key light.
Skin must react realistically to ambient daylight.

=== SKIN / HUMAN REALISM ===
Visible pores.
Fine skin texture.
Subtle natural imperfections.
No plastic skin.
No airbrushed skin.
No over-smoothed beauty filter look.
No hyper-perfect AI symmetry.
No uncanny face.
Realistic facial depth, hairline, baby hairs, texture, pores, and natural expression.

=== UGC CONTEXT ===
The creator is naturally presenting or demonstrating the product as if recording a recommendation, review, testimonial, or product hook for TikTok.
The vibe must be authentic UGC, not a commercial ad.
The environment should be a believable home location such as bathroom, bedroom, vanity corner, mirror area, sink area, or window-lit personal space.

=== PRODUCT LOCK — ABSOLUTE RULE ===
Use the provided product reference image as ground truth.
The product must match the reference image EXACTLY:
- same packaging shape
- same lid shape and material
- same container material
- same label placement
- same label color
- same typography layout
- same visual identity
- same proportions
Do not redesign the product.
Do not simplify the product.
Do not approximate the product.
Do not alter branding, color, shape, or silhouette.
The product must look physically real and naturally integrated into the creator's hand or nearby scene.

=== ANCHOR FRAME LOGIC ===
Replicate the core hook composition or first strong frame from the source video:
- same body orientation
- same gesture logic
- same visual intent
- same framing logic
- same emotional purpose
But apply slight contextual variation:
- different person identity
- slightly different clothing
- slightly different room details
- slightly different secondary objects
Keep the structure and pose logic nearly identical while avoiding exact duplication.

=== POSE / GESTURE ===
Use the source hook or dominant opening frame as pose reference.
Maintain equivalent posture, gesture direction, and framing intent.
If the source shows concern, curiosity, recommendation, product presentation, or problem awareness, preserve that exact behavioral logic.
The pose must feel natural and spontaneous, not posed like a catalog photo.

=== REALISM TARGET ===
The image must look like an actual still frame from a TikTok UGC video.
It should feel like a screenshot from a creator clip, not like an AI beauty portrait.

=== ENVIRONMENT ===
Use a real home environment with believable depth and everyday details:
soft towels, neutral walls, mirror edge, plants, skincare shelf, bed corner, sink area, wood, ceramic, window light, lived-in but clean.
Avoid luxury set design.
Avoid sterile studio backgrounds.

=== STYLE LOCK ===
authentic UGC
real smartphone capture
social media native
casual creator energy
not cinematic
not commercial
not polished advertising
not editorial fashion
not influencer campaign photography

=== OUTPUT RULES ===
- vertical 9:16 composition
- extremely photorealistic
- useful as first-frame anchor for animation
- product clearly visible when required by composition
- creator and product must feel part of the same real photograph
- indistinguishable from genuine smartphone photography
- no text overlays, no UI elements, no watermarks`;

const NEGATIVE_PROMPT = `studio photography, commercial beauty campaign, editorial portrait, fashion shoot, luxury skincare ad, CGI skin, plastic skin, poreless skin, over-smoothed face, beauty filter, uncanny face, AI generated look, 3D render, illustration, fake reflections, glam lighting, dramatic rim light, overly perfect symmetry, stock photo aesthetic, catalog pose, product floating, incorrect packaging, wrong label, wrong logo, wrong lid, wrong jar shape, altered branding, altered proportions, unrealistic hands, extra fingers, warped product, melted packaging, blurry product text, unreadable label, composited fake product, cinematic frame, movie still, overproduced background, hyper-stylized image, glamour shot`;

const VAR_DEFAULTS: Record<string, string> = {
  source_hook_summary: "creator naturally presenting the product in the first attention-grabbing moment of the video",
  creator_action: "holding the product naturally near face or body target while reacting in a believable UGC way",
  body_target: "context-specific based on source video",
  environment_hint: "bathroom or bedroom near window with real home details",
  product_visibility_mode: "clearly visible and physically integrated",
  context_variation_level: "slight variation only",
  target_platform: "sora_or_higgsfield",
  language_market_hint: "visual style aligned to Mexican TikTok Shop UGC if applicable",
};

function buildPrompt(vars: Record<string, string | undefined>): string {
  const r = { ...VAR_DEFAULTS };
  for (const [k, v] of Object.entries(vars)) {
    if (v) r[k] = v;
  }

  let prompt = MASTER_PROMPT;

  prompt += `\n\n=== SCENE VARIABLES ===
Hook summary: ${r.source_hook_summary}
Creator action: ${r.creator_action}
Body/usage target: ${r.body_target}
Environment hint: ${r.environment_hint}
Product visibility: ${r.product_visibility_mode}
Context variation level: ${r.context_variation_level}
Target platform: ${r.target_platform}
Language/market hint: ${r.language_market_hint}`;

  if (vars.actor_description) prompt += `\nActor override: ${vars.actor_description}`;
  if (vars.style_description) prompt += `\nStyle override: ${vars.style_description}`;

  prompt += `\n\n=== NEGATIVE CONSTRAINTS (DO NOT GENERATE) ===\n${NEGATIVE_PROMPT}`;

  return prompt;
}

/* ══════════════════════════════════════════════════════════════ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      job_id,
      source_video_url,
      product_image_url,
      hook_frame_description,
      actor_description,
      style_description,
      variation_policy,
      target_platform,
      language,
      realism_level,
      body_target,
      environment_hint,
      product_visibility_mode,
      context_variation_level,
      language_market_hint,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const platform = target_platform || "generic";
    const realism = realism_level || "maximum";

    // Build prompt from master template + variables
    const prompt = buildPrompt({
      source_hook_summary: hook_frame_description,
      creator_action: hook_frame_description,
      body_target,
      environment_hint,
      product_visibility_mode,
      context_variation_level: context_variation_level || (variation_policy ? JSON.stringify(variation_policy) : undefined),
      target_platform: platform,
      language_market_hint: language_market_hint || (language === "es-MX" ? "visual style aligned to Mexican TikTok Shop UGC" : undefined),
      actor_description,
      style_description,
    });

    const messages: any[] = [
      {
        role: "user",
        content: product_image_url
          ? [
              { type: "text", text: prompt },
              { type: "text", text: "Product reference image (match EXACTLY — this is absolute ground truth):" },
              { type: "image_url", image_url: { url: product_image_url } },
            ]
          : prompt,
      },
    ];

    console.log(`[generate-prompt-lab-reference-image] job=${job_id || "unknown"} platform=${platform} realism=${realism} product_lock=${!!product_image_url}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-prompt-lab-reference-image] Error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo en un momento." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error("El modelo no generó una imagen.");
    }

    // Upload to storage
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileName = `prompt-lab-ref/${job_id || Date.now()}_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("videos")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadErr) {
      console.error("[generate-prompt-lab-reference-image] Upload error:", uploadErr);
      throw new Error("Error subiendo imagen: " + uploadErr.message);
    }

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);

    // Build resolved variables for diagnostics
    const resolvedVars = { ...VAR_DEFAULTS };
    if (hook_frame_description) resolvedVars.source_hook_summary = hook_frame_description;
    if (body_target) resolvedVars.body_target = body_target;
    if (environment_hint) resolvedVars.environment_hint = environment_hint;
    if (product_visibility_mode) resolvedVars.product_visibility_mode = product_visibility_mode;
    if (target_platform) resolvedVars.target_platform = target_platform;

    return new Response(
      JSON.stringify({
        reference_image_url: urlData.publicUrl,
        prompt_used: prompt.substring(0, 800) + "...",
        negative_prompt_used: NEGATIVE_PROMPT,
        variables_resolved: resolvedVars,
        product_lock_enabled: !!product_image_url,
        realism_mode: realism,
        diagnostics: {
          model: "google/gemini-3-pro-image-preview",
          platform,
          realism,
          product_locked: !!product_image_url,
          master_prompt_version: "v1_persistent",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-prompt-lab-reference-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
