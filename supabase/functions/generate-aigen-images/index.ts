import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Master prompt (synced with src/lib/referenceImagePrompt.ts) ── */

const MASTER_PROMPT = `ULTRA REALISTIC smartphone selfie reference photo for a UGC-style TikTok product video.

Create a hyperrealistic vertical smartphone photo that looks exactly like a real iPhone front-camera capture from a beauty or lifestyle content creator filming at home. The image must feel like authentic user generated content, not advertising, not editorial, not studio photography.

=== CORE VISUAL GOAL ===
This image will be used as a base image for HeyGen video generation. It must look indistinguishable from a real smartphone photo posted by a creator on TikTok.

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

=== POSE / GESTURE ===
Use the source hook or dominant opening frame as pose reference.
Maintain equivalent posture, gesture direction, and framing intent.
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
- useful as base image for HeyGen animation
- product clearly visible when required by composition
- creator and product must feel part of the same real photograph
- indistinguishable from genuine smartphone photography
- no text overlays, no UI elements, no watermarks`;

const NEGATIVE_PROMPT = `studio photography, commercial beauty campaign, editorial portrait, fashion shoot, luxury skincare ad, CGI skin, plastic skin, poreless skin, over-smoothed face, beauty filter, uncanny face, AI generated look, 3D render, illustration, fake reflections, glam lighting, dramatic rim light, overly perfect symmetry, stock photo aesthetic, catalog pose, product floating, incorrect packaging, wrong label, wrong logo, wrong lid, wrong jar shape, altered branding, altered proportions, unrealistic hands, extra fingers, warped product, melted packaging, blurry product text, unreadable label, composited fake product, cinematic frame, movie still, overproduced background, hyper-stylized image, glamour shot`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      job_id,
      product_image_url,
      image_hints,
      image_index,
      actor_diversity,
    } = await req.json();

    if (!product_image_url) throw new Error("product_image_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build variation-specific prompt additions
    const hints = image_hints || {};
    const poses = hints.recommended_poses || ["holding product near face", "showing product to camera"];
    const environments = hints.recommended_environments || ["bathroom near window", "bedroom vanity"];
    const expressions = hints.recommended_expressions || ["natural smile", "slight concern", "curious"];

    const idx = image_index || 0;
    const pose = poses[idx % poses.length];
    const env = environments[idx % environments.length];
    const expression = expressions[idx % expressions.length];

    const diversityNote = actor_diversity
      ? `\nIMPORTANT: This is image ${idx + 1} in a set. Use a DIFFERENT creator for each image — vary ethnicity, hair color, hair style, clothing, and background while keeping the same UGC quality and product accuracy.`
      : "";

    const scenePrompt = `${MASTER_PROMPT}

=== SCENE VARIABLES ===
Pose: ${pose}
Environment: ${env}
Expression: ${expression}
Product visibility: ${hints.product_visibility_style || "clearly visible and physically integrated"}
Creator look: ${hints.creator_look_description || "authentic TikTok creator"}
Shot type: ${hints.dominant_shot_type || "selfie medium shot"}
${diversityNote}

=== NEGATIVE CONSTRAINTS (DO NOT GENERATE) ===
${NEGATIVE_PROMPT}`;

    const messages: any[] = [
      {
        role: "user",
        content: [
          { type: "text", text: scenePrompt },
          { type: "text", text: "Product reference image (match EXACTLY — this is absolute ground truth):" },
          { type: "image_url", image_url: { url: product_image_url } },
        ],
      },
    ];

    console.log(`[generate-aigen-images] job=${job_id || "unknown"} image_index=${idx}`);

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
      console.error("[generate-aigen-images] Error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo." }), {
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

    if (!imageData) throw new Error("El modelo no generó una imagen.");

    // Upload to storage
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileName = `aigen/${job_id || Date.now()}_img${idx}_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("videos")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadErr) throw new Error("Error subiendo imagen: " + uploadErr.message);

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        image_url: urlData.publicUrl,
        image_index: idx,
        diagnostics: {
          model: "google/gemini-3-pro-image-preview",
          pose,
          environment: env,
          expression,
          product_locked: true,
          realism_mode: "maximum",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-aigen-images error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
