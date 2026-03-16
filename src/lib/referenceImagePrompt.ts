/**
 * Centralized Reference Image Prompt — Single Source of Truth
 *
 * Every reference-image generation (Prompt Lab, UGC Arcade, any anchor-frame flow)
 * MUST use these exports. No ad-hoc prompts elsewhere.
 */

/* ── Variable interface ── */
export interface ReferenceImageVars {
  source_hook_summary?: string;
  creator_action?: string;
  body_target?: string;
  environment_hint?: string;
  product_visibility_mode?: string;
  context_variation_level?: string;
  target_platform?: string;
  language_market_hint?: string;
  actor_description?: string;
  style_description?: string;
}

/* ── Defaults ── */
const DEFAULTS: Required<ReferenceImageVars> = {
  source_hook_summary:
    "creator naturally presenting the product in the first attention-grabbing moment of the video",
  creator_action:
    "holding the product naturally near face or body target while reacting in a believable UGC way",
  body_target: "context-specific based on source video",
  environment_hint: "bathroom or bedroom near window with real home details",
  product_visibility_mode: "clearly visible and physically integrated",
  context_variation_level: "slight variation only",
  target_platform: "sora_or_higgsfield",
  language_market_hint:
    "visual style aligned to Mexican TikTok Shop UGC if applicable",
  actor_description: "",
  style_description: "",
};

/* ── Master Prompt ── */
export const REFERENCE_IMAGE_MASTER_PROMPT = `ULTRA REALISTIC smartphone selfie reference photo for a UGC-style TikTok product video.

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

/* ── Negative Prompt ── */
export const REFERENCE_IMAGE_NEGATIVE_PROMPT = `studio photography, commercial beauty campaign, editorial portrait, fashion shoot, luxury skincare ad, CGI skin, plastic skin, poreless skin, over-smoothed face, beauty filter, uncanny face, AI generated look, 3D render, illustration, fake reflections, glam lighting, dramatic rim light, overly perfect symmetry, stock photo aesthetic, catalog pose, product floating, incorrect packaging, wrong label, wrong logo, wrong lid, wrong jar shape, altered branding, altered proportions, unrealistic hands, extra fingers, warped product, melted packaging, blurry product text, unreadable label, composited fake product, cinematic frame, movie still, overproduced background, hyper-stylized image, glamour shot`;

/* ── Builder: resolves variables into the final prompt ── */
export function buildReferenceImagePrompt(vars: ReferenceImageVars = {}): string {
  const resolved = { ...DEFAULTS, ...vars };

  let prompt = REFERENCE_IMAGE_MASTER_PROMPT;

  // Append scene-specific variables
  prompt += `\n\n=== SCENE VARIABLES ===
Hook summary: ${resolved.source_hook_summary}
Creator action: ${resolved.creator_action}
Body/usage target: ${resolved.body_target}
Environment hint: ${resolved.environment_hint}
Product visibility: ${resolved.product_visibility_mode}
Context variation level: ${resolved.context_variation_level}
Target platform: ${resolved.target_platform}
Language/market hint: ${resolved.language_market_hint}`;

  if (resolved.actor_description) {
    prompt += `\nActor override: ${resolved.actor_description}`;
  }
  if (resolved.style_description) {
    prompt += `\nStyle override: ${resolved.style_description}`;
  }

  // Append mandatory negative constraints inline
  prompt += `\n\n=== NEGATIVE CONSTRAINTS (DO NOT GENERATE) ===\n${REFERENCE_IMAGE_NEGATIVE_PROMPT}`;

  return prompt;
}

/* ── Builder: returns negative prompt (for providers that accept it separately) ── */
export function buildReferenceImageNegativePrompt(_vars: ReferenceImageVars = {}): string {
  return REFERENCE_IMAGE_NEGATIVE_PROMPT;
}

/* ── Resolve variables with defaults (useful for diagnostics) ── */
export function resolveVars(vars: ReferenceImageVars = {}): Required<ReferenceImageVars> {
  return { ...DEFAULTS, ...vars };
}

/* ── Realism policy constant ── */
export const REFERENCE_IMAGE_REALISM_MODE = "maximum" as const;
