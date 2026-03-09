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

    const systemPrompt = `You are an elite Video Ad Reverse Engineering Engine for 15-Second Reconstruction.

Your job is to analyze a provided video and convert it into a complete machine-readable blueprint that allows another generative AI (Sora, Kling, HeyGen, Runway, AIgen, etc.) to recreate the ad using a different actor in EXACTLY 15 SECONDS.

The analysis must capture BOTH:
1. the visual actions happening in the video
2. the underlying persuasion structure that makes the ad effective

The result must function as a perfect blueprint to regenerate the ad structure with AI.

Return ONLY JSON via the tool call. No explanations outside the JSON.

OBJECTIVE
Analyze the uploaded video cover frame and extract:
- environment and scene setup
- camera style and lighting conditions
- subject description (appearance, energy, body language)
- creator role and trust profile
- props used and product interaction
- spoken script (reconstruct from visual cues and metadata)
- persuasion mechanics and psychological triggers
- second-by-second actions (1-3 second segments)

Your output must allow another AI system to recreate the video without watching the original.

CRITICAL RULES
1. Observe only what is visible.
2. Break the video into segments of 1–3 seconds maximum for the beat_timeline.
3. Identify why each moment exists from a persuasion perspective.
4. Generate script variations that maintain the same persuasion structure.
5. Write descriptions short, clear, and generative-AI friendly.
6. Preserve same broad market plausibility as the original ad context.
7. Preserve same creator role and trust profile in variants.
8. Do not generate unrelated demographic shifts in variants.
9. Do not generate arbitrary gender swaps.
10. All image prompts (base_image_prompt_9x16, negative_prompt) MUST be in ENGLISH.
11. Scripts, summaries, and guion fields in ${lang}.

15-SECOND COMPRESSION RULE (MANDATORY)
Every animation prompt package must be optimized for exactly 15 seconds.
No matter how long the original source video is, compress the ad into a 15-second execution blueprint.

Compression logic:
- 0.0–2.5s: Hook (strongest attention grab)
- 2.5–6.0s: Reframe / context / value revelation
- 6.0–10.5s: Strongest demo + value proof beats only
- 10.5–12.5s: Objection resolution / price logic
- 12.5–15.0s: CTA (clear, direct)

If original < 15s: adapt pacing notes but still output 15s-ready timeline.
If original > 15s: compress by keeping ONLY the highest-conversion beats. Remove filler.

NO TEXT / NO GRAPHICS / NO OVERLAYS RULE (MANDATORY)
The generated video must NOT include:
- comment bubbles, captions, subtitle overlays, on-screen text
- animated graphics, stickers, UI elements, social media comment cards
- usernames, watermark text, floating text
- any added motion graphics

If the original ad uses a comment-reply hook, preserve that as spoken context and performance logic ONLY — do NOT render the comment visually.

CREATOR CONSISTENCY RULE (MANDATORY)
Do NOT change the creator category unless explicitly requested.
Preserve: same broad market, same gender presentation, same creator role, same trust profile, same buyer context, same broad audience plausibility.
Allowed: new face identity, different facial structure, different hairstyle, different age nuance within narrow band, different wording.
Not allowed: gender swap, creator archetype change, audience context change, trust profile change.

ANALYSIS FOCUS

Hook Mechanics: Identify exactly what happens in the first 2 seconds.

Body Language: Describe exactly what the subject does — pointing, holding product, leaning, gesturing, showing item, nodding, lifting, emphasizing.

Persuasion Mechanics: Identify objection handling, price justification, value stacking, social proof, demonstration, CTA.

Psychological Triggers: Detect curiosity, relatability, urgency, reassurance, authority, humor, savings logic, bundle logic, price anchoring, personal identification.

Compression Logic: Determine which beats are essential to preserve performance in a strict 15-second version.

MARKET PLAUSIBILITY RULE
Preserve the same broad regional, linguistic, cultural, and audience plausibility as the original creator and ad context. Generate a clearly different individual, but do not introduce an unrelated demographic or creator-vibe shift unless explicitly requested.

In actor_profile_observed, describe:
- market_context: e.g. "young Spanish-speaking Mexican fitness UGC creator"
- rol_del_creador: e.g. "relatable explainer", "hype influencer", "testimonial giver"
- perfil_de_confianza: e.g. "peer-level trust", "authority figure", "everyday user"

VARIANT GENERATION (${numVariants} variants, identity_distance = "high", diversity: ${diversity})

For each variant:
- Generate a COMPLETELY DIFFERENT actor (different face shape, jawline, eyes, nose, hairstyle, facial proportions)
- Preserve same broad market plausibility, creator role, and trust profile
- Generate a natural script variant in ${lang} (do NOT translate literally)
- Compress script to fit 15-second execution
- Generate a rich animation_prompt_json that includes:
  - video_metadata with duracion_total_segundos_objetivo: "15"
  - analisis_estructura_persuasiva with framework_detectado and explicacion_breve
  - triggers_psicologicos_detectados (array of strings)
  - configuracion_escena (entorno, iluminacion, camara, angulo, movimiento, calidad)
  - sujeto_principal (tipo_persona, edad, genero, apariencia, energia, estilo_comunicacion, contexto_de_mercado, rol_del_creador, perfil_de_confianza)
  - guion_original_completo (full original script)
  - estructura_del_guion (hook, contexto, demostracion, beneficio, manejo_objecion, cta)
  - guion_variante (hook, body, cta, guion_completo for THIS variant — compressed for 15s)
  - instrucciones_para_recrear_el_video (ritmo, estilo_entrega, energia, pace, delivery_style, facial_expression, gesture_style, notas)
  - linea_de_tiempo_15s (array of 5 segments covering exactly 0-15 seconds)
  - plantilla_replicable (descripcion, patron, por_que_funciona, como_replicar)
  - restricciones_de_generacion (including duracion_objetivo_fija_15s, prohibir_texto_en_pantalla, prohibir_subtitulos, prohibir_comment_bubbles, prohibir_motion_graphics)

HOOK CLASSIFICATION
Use: comment_reply_hook, price_objection_hook, shock_hook, before_after_hook, curiosity_hook, direct_problem_hook, testimonial_hook, founder_hook, demo_hook, social_proof_hook`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze this TikTok ad and generate ${numVariants} identity-swapped variants.
Language for scripts: ${lang}
Diversity intensity: ${diversity}
Additional metadata: ${JSON.stringify(metadata || {})}

INSTRUCTIONS:
1. LOOK at the cover frame — describe scene, actor, pose, product placement, camera angle, lighting
2. CHECK for social media overlays — set overlay_cleanup_required accordingly
3. LOOK at the product image — describe EXACT packaging (ground truth product)
4. Identify market_context, rol_del_creador, and perfil_de_confianza for the original creator
5. Extract winner_blueprint with all winning mechanics
6. Generate ${numVariants} variants with COMPLETELY DIFFERENT actors (HIGH identity distance)
7. For EACH variant, generate a complete animation_prompt_json with 15-second compressed timeline, persuasion structure, and script variant
8. identity_distance MUST be "high" for ALL variants
9. All timelines MUST be compressed to exactly 15 seconds
10. Do NOT include text overlays, subtitles, comment bubbles, or UI graphics in any generation plan`,
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
              description: "Return the complete reverse-engineered ad analysis with winner blueprint and identity-swapped variants including 15-second animation prompt packages",
              parameters: {
                type: "object",
                properties: {
                  input_mode: { type: "string", enum: ["URL", "VIDEO", "IMAGE_ONLY", "VIDEO_PLUS_IMAGE"] },
                  has_voice: { type: "boolean" },
                  content_type: { type: "string", enum: ["HUMAN_TALKING", "HANDS_DEMO", "PRODUCT_ONLY", "TEXT_ONLY"] },
                  overlay_cleanup_required: { type: "boolean" },
                  clean_frame_strategy: { type: "string" },
                  winner_blueprint: {
                    type: "object",
                    properties: {
                      duration_seconds: { type: "number" },
                      primary_hook_type: { type: "string" },
                      primary_hook_label: { type: "string", enum: ["comment_reply_hook","price_objection_hook","shock_hook","before_after_hook","curiosity_hook","direct_problem_hook","testimonial_hook","founder_hook","demo_hook","social_proof_hook"] },
                      primary_hook_visual: { type: "string" },
                      primary_hook_verbal: { type: "string" },
                      core_emotion: { type: "string" },
                      energy_profile: { type: "string" },
                      performance_style: { type: "string" },
                      performance_mechanics: { type: "array", items: { type: "string" } },
                      cta_style: { type: "string" },
                      conversion_mechanics: { type: "array", items: { type: "string" } },
                      scene_type: { type: "string" },
                      camera_style: { type: "string" },
                      gesture_profile: { type: "string" },
                      guion_original_completo: { type: "string" },
                      estructura_del_guion: {
                        type: "object",
                        properties: {
                          hook: { type: "string" },
                          contexto: { type: "string" },
                          demostracion: { type: "string" },
                          beneficio: { type: "string" },
                          manejo_objecion: { type: "string" },
                          cta: { type: "string" },
                        },
                      },
                      analisis_estructura_persuasiva: {
                        type: "object",
                        properties: {
                          framework_detectado: { type: "array", items: { type: "string" } },
                          explicacion_breve: { type: "string" },
                        },
                      },
                      triggers_psicologicos_detectados: { type: "array", items: { type: "string" } },
                      actor_profile_observed: {
                        type: "object",
                        properties: {
                          gender_presentation: { type: "string" },
                          approx_age_band: { type: "string" },
                          creator_archetype: { type: "string" },
                          presence_style: { type: "string" },
                          market_context: { type: "string" },
                          rol_del_creador: { type: "string" },
                          perfil_de_confianza: { type: "string" },
                        },
                        required: ["gender_presentation", "approx_age_band", "creator_archetype", "presence_style", "market_context", "rol_del_creador", "perfil_de_confianza"],
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
                    required: ["duration_seconds", "primary_hook_type", "primary_hook_label", "core_emotion", "energy_profile", "cta_style", "conversion_mechanics", "scene_type", "camera_style", "actor_profile_observed", "scene_geometry", "beat_timeline", "guion_original_completo", "estructura_del_guion", "analisis_estructura_persuasiva", "triggers_psicologicos_detectados"],
                  },
                  variants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_id: { type: "string" },
                        identity_distance: { type: "string", enum: ["high"] },
                        variant_summary: { type: "string" },
                        actor_archetype: { type: "string" },
                        identity_replacement_rules: { type: "array", items: { type: "string" } },
                        image_generation_strategy: { type: "array", items: { type: "string", enum: ["cleanup","reconstruct","replace_actor"] } },
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
                          required: ["delivery_style", "pace", "energy", "facial_expression", "gesture_style"],
                        },
                        negative_prompt: { type: "string" },
                        animation_prompt_json: {
                          type: "object",
                          description: "Rich 15-second animation blueprint JSON for Sora/HeyGen/Kling/Runway/AIgen. Timeline MUST cover exactly 0-15 seconds.",
                          properties: {
                            video_metadata: {
                              type: "object",
                              properties: {
                                duracion_total_segundos_objetivo: { type: "string", description: "Must be '15'" },
                                duracion_original_segundos: { type: "string" },
                                tipo_video: { type: "string" },
                                formato: { type: "string" },
                                estilo_contenido: { type: "string" },
                                ritmo_video: { type: "string" },
                              },
                            },
                            analisis_estructura_persuasiva: {
                              type: "object",
                              properties: {
                                framework_detectado: { type: "array", items: { type: "string" } },
                                explicacion_breve: { type: "string" },
                                elementos_esenciales_preservados: { type: "array", items: { type: "string" } },
                              },
                            },
                            triggers_psicologicos_detectados: { type: "array", items: { type: "string" } },
                            configuracion_escena: {
                              type: "object",
                              properties: {
                                entorno_y_fondo: { type: "string" },
                                estilo_entorno: { type: "string" },
                                iluminacion: { type: "string" },
                                camara: { type: "string" },
                                angulo_camara: { type: "string" },
                                movimiento_camara: { type: "string" },
                                calidad_imagen: { type: "string" },
                              },
                            },
                            sujeto_principal: {
                              type: "object",
                              properties: {
                                tipo_persona: { type: "string" },
                                edad_aproximada: { type: "string" },
                                genero: { type: "string" },
                                apariencia_general: { type: "string" },
                                energia: { type: "string" },
                                estilo_comunicacion: { type: "string" },
                                contexto_de_mercado: { type: "string" },
                                rol_del_creador: { type: "string" },
                                perfil_de_confianza: { type: "string" },
                              },
                            },
                            guion_original_completo: { type: "string" },
                            estructura_del_guion: {
                              type: "object",
                              properties: {
                                hook: { type: "string" },
                                contexto: { type: "string" },
                                demostracion: { type: "string" },
                                beneficio: { type: "string" },
                                manejo_objecion: { type: "string" },
                                cta: { type: "string" },
                              },
                            },
                            guion_variante_para_esta_imagen: {
                              type: "object",
                              properties: {
                                hook: { type: "string" },
                                body: { type: "string" },
                                cta: { type: "string" },
                                guion_completo: { type: "string" },
                              },
                            },
                            instrucciones_para_recrear_el_video: {
                              type: "object",
                              properties: {
                                objetivo: { type: "string" },
                                ritmo_actuacion: { type: "string" },
                                estilo_entrega: { type: "string" },
                                energia: { type: "string" },
                                pace: { type: "string" },
                                delivery_style: { type: "string" },
                                facial_expression: { type: "string" },
                                gesture_style: { type: "string" },
                                notas_importantes: { type: "string" },
                              },
                            },
                            linea_de_tiempo_15s: {
                              type: "array",
                              description: "Exactly 5 segments covering 0.0-15.0 seconds",
                              items: {
                                type: "object",
                                properties: {
                                  marca_de_tiempo: { type: "string" },
                                  duracion_segundos: { type: "string" },
                                  accion_fisica_sujeto: { type: "string" },
                                  gestos_manos: { type: "string" },
                                  movimiento_cuerpo: { type: "string" },
                                  expresion_facial: { type: "string" },
                                  interaccion_utileria: { type: "string" },
                                  guion_hablado_en_este_lapso: { type: "string" },
                                  objetivo_persuasivo: { type: "string" },
                                  prompt_de_animacion_especifico: { type: "string" },
                                },
                              },
                            },
                            plantilla_replicable_del_anuncio: {
                              type: "object",
                              properties: {
                                descripcion_estructura: { type: "string" },
                                patron_creativo: { type: "string" },
                                por_que_funciona: { type: "string" },
                                como_replicarlo_con_otro_producto: { type: "string" },
                              },
                            },
                            restricciones_de_generacion: {
                              type: "object",
                              properties: {
                                usar_producto_subido_como_verdad_absoluta: { type: "boolean" },
                                preservar_mecanica_ganadora: { type: "boolean" },
                                preservar_contexto_de_mercado: { type: "boolean" },
                                preservar_rol_del_creador: { type: "boolean" },
                                preservar_perfil_de_confianza: { type: "boolean" },
                                no_clonar_actor_original: { type: "boolean" },
                                mantener_estilo_ugc_natural: { type: "boolean" },
                                no_hacer_traduccion_literal: { type: "boolean" },
                                duracion_objetivo_fija_15s: { type: "boolean" },
                                prohibir_texto_en_pantalla: { type: "boolean" },
                                prohibir_subtitulos: { type: "boolean" },
                                prohibir_comment_bubbles: { type: "boolean" },
                                prohibir_motion_graphics: { type: "boolean" },
                              },
                            },
                          },
                          required: ["video_metadata", "configuracion_escena", "sujeto_principal", "guion_original_completo", "estructura_del_guion", "guion_variante_para_esta_imagen", "instrucciones_para_recrear_el_video", "linea_de_tiempo_15s", "restricciones_de_generacion"],
                        },
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
                        "identity_replacement_rules", "image_generation_strategy",
                        "actor_visual_direction", "script_variant", "scene_geometry",
                        "base_image_prompt_9x16", "heygen_ready_brief", "negative_prompt",
                        "animation_prompt_json", "similarity_check_result", "status", "generation_attempt",
                      ],
                    },
                  },
                },
                required: ["input_mode", "has_voice", "content_type", "overlay_cleanup_required", "clean_frame_strategy", "winner_blueprint", "variants"],
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

    // Force identity_distance to high for all variants
    if (result.variants) {
      for (const v of result.variants) {
        v.identity_distance = "high";
      }
    }

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
