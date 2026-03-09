import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, variant_count, metadata, cover_url, product_image_url, language, diversity_intensity } = await req.json();
    if (!video_url) throw new Error("video_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const numVariants = variant_count || 3;
    const lang = language || "es-MX";
    const diversity = diversity_intensity || "high";

    const systemPrompt = `You are an expert TikTok ad deconstruction engine.

Your job is not to copy the video. Your job is to extract the winning mechanics of the ad and rebuild them with different actors.

The goal is to generate new ad variants that preserve the performance structure of a winning TikTok ad.
The final output will be used to generate new UGC-style images and avatar videos via HeyGen.
Therefore the analysis must be extremely precise.

STEP 1 — UNDERSTAND THE ORIGINAL AD
Analyze the full TikTok video and extract the exact mechanics that make it perform.
Identify: total duration, hook timing, hook type, emotional trigger, visual framing, creator archetype, gesture style, product interaction, camera style, energy curve, CTA structure.
Focus on performance mechanics, not the identity of the actor.

STEP 2 — EXTRACT WINNING MECHANICS (winner_blueprint)
Define the exact elements that must remain consistent in every variant:
- ad duration, hook timing, product placement, product orientation
- camera distance, handheld UGC realism, visual hook structure
- gesture rhythm, emotional intention, creator authenticity
- CTA logic, storytelling sequence, scene type

STEP 3 — PRODUCT LOCK
The user uploads a product image. This product is the ground truth reference.
Rules:
- The product must match the uploaded reference exactly
- Label design, color, proportions and shape must remain identical
- The actor must hold the exact product provided
- Do not reinterpret the product

STEP 4 — IDENTITY SWAP (MANDATORY)
The actor identity MUST change completely. Each variant must look like a completely different person.
Diversity intensity: ${diversity}

Forbidden outcomes:
- same actor with minor edits
- similar facial structure
- sibling-like similarity
- only wardrobe change
- nearly identical faces

Each variant must differ in: face shape, jawline, eyebrow structure, eye shape, nose shape, lip structure, hairline, hairstyle, facial proportions, overall vibe.

The difference must be immediately noticeable at first glance.
However, keep demographic plausibility for the target market.

STEP 5 — SCENE VARIATION
The scene must be similar but not identical.
Allowed: same type of room, different furniture layout, slightly different background, different wall tone, different lighting nuance.
Preserve: approximate framing, approximate camera distance, approximate composition.
Do not copy the exact frame.

STEP 6 — UGC REALISM
Images must feel like authentic TikTok UGC: natural lighting, handheld phone camera perspective, slightly imperfect framing, authentic creator posture, casual environment.
Avoid: studio lighting, cinematic framing, overly polished commercial aesthetics.

STEP 7 — SCRIPT VARIANTS
Each variant must include a script variant in language: ${lang}
Rules:
- preserve the original hook intention and emotional trigger
- preserve duration and CTA logic
- preserve the winner's conversion mechanics
- change wording naturally — do NOT translate literally
- each script must be slightly different
- scripts must sound natural for an avatar delivery

STEP 8 — VARIANT DIVERSITY STRATEGY
Variant A: same mechanics + different actor + same energy level + different outfit
Variant B: same mechanics + different actor + different hairstyle + slight background variation + slightly different wording
Variant C: same mechanics + different actor + compatible but different vibe + higher expressivity + alternative hook wording preserving intent

STEP 9 — INTERNAL VALIDATION
Before finalizing, validate:
- Does each variant clearly look like a different individual than the original?
- Are A, B, C sufficiently different from each other?
- Do all variants preserve the exact uploaded product?
- Do all variants preserve the winning mechanics?
If one fails, mark it as "needs_regeneration".

STEP 10 — OUTPUT
Return ONLY valid JSON via the tool call. No markdown. No commentary.
All prompts (base_image_prompt_9x16, negative_prompt) MUST be in ENGLISH.
Scripts and summaries must be in ${lang}.`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze this TikTok ad and generate ${numVariants} identity-swapped variants.
Language for scripts: ${lang}
Diversity intensity: ${diversity}
Additional metadata: ${JSON.stringify(metadata || {})}

INSTRUCTIONS:
1. LOOK at the cover frame image — describe scene, actor, pose, product placement, camera angle, lighting
2. LOOK at the product image — describe EXACT packaging (this is the real product)
3. Extract winner_blueprint with all winning mechanics
4. Generate ${numVariants} variants with COMPLETELY DIFFERENT actors but SAME winning mechanics
5. Each variant needs: identity-swapped image prompt, script variant in ${lang}, HeyGen-ready brief, validation checks`,
    });

    if (cover_url) {
      userContent.push({ type: "image_url", image_url: { url: cover_url } });
    }
    if (product_image_url) {
      userContent.push({ type: "image_url", image_url: { url: product_image_url } });
    }

    console.log("Sending to Gemini:", { hasCover: !!cover_url, hasProduct: !!product_image_url, numVariants, lang, diversity });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analysis_result",
              description: "Return the complete analysis with winner blueprint and identity-swapped variants",
              parameters: {
                type: "object",
                properties: {
                  input_mode: { type: "string", enum: ["URL", "VIDEO", "IMAGE_ONLY", "VIDEO_PLUS_IMAGE"] },
                  has_voice: { type: "boolean" },
                  content_type: { type: "string", enum: ["HUMAN_TALKING", "HANDS_DEMO", "PRODUCT_ONLY", "TEXT_ONLY"] },
                  winner_blueprint: {
                    type: "object",
                    properties: {
                      duration_seconds: { type: "number" },
                      primary_hook_type: { type: "string" },
                      primary_hook_visual: { type: "string" },
                      primary_hook_verbal: { type: "string" },
                      core_emotion: { type: "string" },
                      energy_profile: { type: "string" },
                      performance_style: { type: "string" },
                      cta_style: { type: "string" },
                      conversion_mechanics: { type: "array", items: { type: "string" } },
                      scene_type: { type: "string" },
                      camera_style: { type: "string" },
                      gesture_profile: { type: "string" },
                      actor_profile_observed: {
                        type: "object",
                        properties: {
                          gender_presentation: { type: "string" },
                          approx_age_band: { type: "string" },
                          creator_archetype: { type: "string" },
                          presence_style: { type: "string" },
                        },
                        required: ["gender_presentation", "approx_age_band", "creator_archetype", "presence_style"],
                      },
                      scene_geometry: {
                        type: "object",
                        properties: {
                          camera_distance: { type: "string" },
                          product_hand: { type: "string" },
                          product_position: { type: "string" },
                          camera_angle: { type: "string" },
                          lighting_direction: { type: "string" },
                        },
                        required: ["camera_distance", "product_hand", "product_position", "camera_angle", "lighting_direction"],
                      },
                      beat_timeline: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            start_sec: { type: "number" },
                            end_sec: { type: "number" },
                            beat_type: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["start_sec", "end_sec", "beat_type", "description"],
                        },
                      },
                    },
                    required: ["duration_seconds", "primary_hook_type", "core_emotion", "energy_profile", "cta_style", "conversion_mechanics", "scene_type", "camera_style", "actor_profile_observed", "scene_geometry", "beat_timeline"],
                  },
                  variants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_id: { type: "string" },
                        identity_distance: { type: "string", enum: ["low", "medium", "high"] },
                        variant_summary: { type: "string" },
                        actor_archetype: { type: "string" },
                        actor_visual_direction: {
                          type: "object",
                          properties: {
                            gender_presentation: { type: "string" },
                            approx_age_band: { type: "string" },
                            face_shape: { type: "string" },
                            hair_style: { type: "string" },
                            hair_color: { type: "string" },
                            skin_tone_range: { type: "string" },
                            overall_vibe: { type: "string" },
                            wardrobe: { type: "string" },
                          },
                          required: ["gender_presentation", "approx_age_band", "face_shape", "hair_style", "hair_color", "skin_tone_range", "overall_vibe", "wardrobe"],
                        },
                        script_variant: {
                          type: "object",
                          properties: {
                            language: { type: "string" },
                            duration_target_seconds: { type: "number" },
                            hook: { type: "string" },
                            body: { type: "string" },
                            cta: { type: "string" },
                            full_script: { type: "string" },
                          },
                          required: ["language", "duration_target_seconds", "hook", "body", "cta", "full_script"],
                        },
                        on_screen_text_plan: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              timestamp: { type: "string" },
                              text: { type: "string" },
                            },
                            required: ["timestamp", "text"],
                          },
                        },
                        shotlist: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              shot: { type: "number" },
                              duration: { type: "string" },
                              description: { type: "string" },
                            },
                            required: ["shot", "duration", "description"],
                          },
                        },
                        scene_geometry: {
                          type: "object",
                          properties: {
                            camera_distance: { type: "string" },
                            product_hand: { type: "string" },
                            product_position: { type: "string" },
                            camera_angle: { type: "string" },
                            lighting_direction: { type: "string" },
                          },
                          required: ["camera_distance", "product_hand", "product_position", "camera_angle", "lighting_direction"],
                        },
                        base_image_prompt_9x16: { type: "string" },
                        heygen_ready_brief: {
                          type: "object",
                          properties: {
                            avatar_instruction: { type: "string" },
                            delivery_style: { type: "string" },
                            pace: { type: "string" },
                            energy: { type: "string" },
                            facial_expression: { type: "string" },
                            gesture_style: { type: "string" },
                          },
                          required: ["avatar_instruction", "delivery_style", "pace", "energy", "facial_expression", "gesture_style"],
                        },
                        negative_prompt: { type: "string" },
                        similarity_check_result: {
                          type: "object",
                          properties: {
                            against_original: { type: "string", enum: ["pass", "fail"] },
                            cross_variant_diversity: { type: "string", enum: ["pass", "fail"] },
                            product_lock: { type: "string", enum: ["pass", "fail"] },
                            mechanics_preserved: { type: "string", enum: ["pass", "fail"] },
                            notes: { type: "array", items: { type: "string" } },
                          },
                          required: ["against_original", "cross_variant_diversity", "product_lock", "mechanics_preserved", "notes"],
                        },
                        status: { type: "string", enum: ["ready", "needs_regeneration"] },
                        generation_attempt: { type: "number" },
                      },
                      required: [
                        "variant_id", "identity_distance", "variant_summary", "actor_archetype",
                        "actor_visual_direction", "script_variant", "on_screen_text_plan",
                        "shotlist", "scene_geometry", "base_image_prompt_9x16",
                        "heygen_ready_brief", "negative_prompt",
                        "similarity_check_result", "status", "generation_attempt",
                      ],
                    },
                  },
                },
                required: ["input_mode", "has_voice", "content_type", "winner_blueprint", "variants"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analysis_result" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }), {
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

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(aiData).substring(0, 1000));
      throw new Error("AI did not return structured data");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
