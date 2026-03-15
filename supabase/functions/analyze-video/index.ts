import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, variant_count, metadata, cover_url, product_image_url, language, diversity_intensity, tiktok_compliance, additional_image_urls } = await req.json();
    if (!video_url) throw new Error("video_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const numVariants = variant_count || 3;
    const lang = language || "es-MX";
    const diversity = diversity_intensity || "high";

    // Extract video duration from metadata for compression instructions
    const videoDuration = metadata?.duration || 0;
    const compressionNote = videoDuration > 9
      ? `\nIMPORTANT: The original video is ${videoDuration} seconds long. You MUST compress the ad into exactly 9 seconds by keeping ONLY the highest-conversion beats. Remove all filler, repeated explanations, and secondary beats. Preserve: hook (0-1.5s), reframe (1.5-3.5s), strongest demo/benefit (3.5-6.5s), proof/objection (6.5-8.0s), CTA (8.0-9.0s).`
      : videoDuration > 0 && videoDuration < 9
      ? `\nNote: The original video is only ${videoDuration} seconds. Adapt pacing to fill a 9-second execution blueprint naturally.`
      : "";

    const complianceBlock = tiktok_compliance ? `

FILTRO ANTI-BAN TIKTOK SHOP (OBLIGATORIO — CUMPLIR AL 100%):
- NO promesas médicas, curas ni garantías de resultados absolutos
- NO comparativas de "antes y después" con resultados garantizados
- NO claims de salud regulados (FDA, COFEPRIS, etc.)
- NO lenguaje de "garantía", "100% efectivo", "cura", "elimina", "milagroso"
- SÍ experiencia personal: "a mí me funcionó", "noté cambios"
- SÍ prueba social: "miles de personas lo usan"
- SÍ urgencia comercial: escasez, descuentos, tiempo limitado
- SÍ beneficios demostrables sin claims médicos
- Usa disclaimers implícitos: "resultados pueden variar"
- Todos los scripts de variantes DEBEN cumplir estas reglas` : "";

    const systemPrompt = `You are an elite Video Ad Reverse Engineering Engine for 15-Second Reconstruction.

Your job is to analyze a provided video and convert it into a complete machine-readable blueprint that allows another generative AI (Sora, Kling, HeyGen, Runway, AIgen, etc.) to recreate the ad using a different actor in EXACTLY 9 SECONDS.
${compressionNote}

The analysis must capture BOTH:
1. the visual actions happening in the video
2. the underlying persuasion structure that makes the ad effective

Return ONLY JSON via the tool call. No explanations outside the JSON.

CRITICAL RULES
1. Observe only what is visible.
2. Break the video into segments for the beat_timeline.
3. Identify why each moment exists from a persuasion perspective.
4. Generate script variations that maintain the same persuasion structure.
5. Preserve same broad market plausibility as the original ad context.
6. Preserve same creator role and trust profile in variants.
7. Do not generate unrelated demographic shifts or arbitrary gender swaps.
8. All image prompts (base_image_prompt_9x16, negative_prompt) MUST be in ENGLISH.
9. Scripts, summaries, guion fields, guion_variante, hook, body, cta, full_script MUST be in ${lang}.
10. If ${lang} starts with "es", use natural spoken Spanish matching the target market. For es-MX: use Mexican Spanish vocabulary, phrasing, and tone — avoid Spain Spanish and neutral corporate Spanish. Write dialogue as a real Mexican UGC creator would speak.
11. NEVER translate user-provided Spanish scripts to English.

15-SECOND COMPRESSION RULE (MANDATORY)
No matter how long the original video is, compress to exactly 15 seconds:
- 0.0–2.5s: Hook (strongest attention grab)
- 2.5–6.0s: Reframe / context / value revelation  
- 6.0–10.5s: Strongest demo + value proof beats only
- 10.5–12.5s: Objection resolution / price logic
- 12.5–15.0s: CTA (clear, direct)

NO TEXT / NO OVERLAYS RULE
Generated video must NOT include comment bubbles, captions, subtitles, text overlays, animated graphics, stickers, UI elements. If original uses comment-reply hook, preserve as spoken context ONLY.

CREATOR CONSISTENCY RULE
Preserve: same broad market, same gender presentation, same creator role, same trust profile, same audience fit.
Change: face identity, facial structure, hairstyle, wording.

For each variant, generate an animation_prompt_json object containing:
- video_metadata (duracion_total_segundos_objetivo: "15", duracion_original_segundos, tipo_video, formato, estilo_contenido, ritmo_video)
- analisis_estructura_persuasiva (framework_detectado, explicacion_breve)
- triggers_psicologicos_detectados (array)
- configuracion_escena (entorno_y_fondo, iluminacion, camara, angulo_camara, movimiento_camara)
- sujeto_principal (tipo_persona, edad_aproximada, genero, apariencia_general, energia, estilo_comunicacion, contexto_de_mercado, rol_del_creador, perfil_de_confianza)
- guion_original_completo
- estructura_del_guion (hook, contexto, demostracion, beneficio, manejo_objecion, cta)
- guion_variante_para_esta_imagen (hook, body, cta, guion_completo — compressed for 15s)
- instrucciones_para_recrear_el_video (objetivo, ritmo_actuacion, estilo_entrega, energia, pace, delivery_style, facial_expression, gesture_style)
- linea_de_tiempo_15s (5 segments covering 0.0-15.0 seconds with marca_de_tiempo, accion_fisica, gestos, expresion, guion_hablado, objetivo_persuasivo, prompt_de_animacion)
- plantilla_replicable_del_anuncio (descripcion_estructura, patron_creativo, por_que_funciona)
- restricciones_de_generacion (all boolean flags for product lock, mechanics, no text, 15s duration, etc.)

HOOK CLASSIFICATION
Use: comment_reply_hook, price_objection_hook, shock_hook, before_after_hook, curiosity_hook, direct_problem_hook, testimonial_hook, founder_hook, demo_hook, social_proof_hook
${complianceBlock}`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze this TikTok ad and generate ${numVariants} identity-swapped variants.
Language for scripts: ${lang}
Diversity intensity: ${diversity}
Video duration: ${videoDuration || "unknown"} seconds
Additional metadata: ${JSON.stringify(metadata || {})}

INSTRUCTIONS:
1. LOOK at the cover frame — describe scene, actor, pose, product placement, camera angle, lighting
2. CHECK for social media overlays — set overlay_cleanup_required accordingly
3. LOOK at the product image — describe EXACT packaging (ground truth product)
4. Identify market_context, rol_del_creador, and perfil_de_confianza for the original creator
5. Extract winner_blueprint with all winning mechanics
6. Generate ${numVariants} variants with COMPLETELY DIFFERENT actors (HIGH identity distance)
7. For EACH variant, generate a complete animation_prompt_json with 15-second compressed timeline
8. identity_distance MUST be "high" for ALL variants
9. ALL timelines MUST be compressed to exactly 15 seconds regardless of original duration
10. Do NOT include text overlays, subtitles, comment bubbles, or UI graphics`,
    });

    if (cover_url) {
      userContent.push({ type: "image_url", image_url: { url: cover_url } });
    }
    if (product_image_url) {
      userContent.push({ type: "image_url", image_url: { url: product_image_url } });
    }
    if (Array.isArray(additional_image_urls)) {
      for (const imgUrl of additional_image_urls.slice(0, 3)) {
        userContent.push({ type: "text", text: "Additional product reference image showing real product details, size, and appearance:" });
        userContent.push({ type: "image_url", image_url: { url: imgUrl } });
      }
    }
    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];

    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analysis_result",
            description: "Return the reverse-engineered ad analysis with winner blueprint and identity-swapped variants",
            parameters: {
              type: "object",
              properties: {
                input_mode: { type: "string" },
                has_voice: { type: "boolean" },
                content_type: { type: "string" },
                overlay_cleanup_required: { type: "boolean" },
                clean_frame_strategy: { type: "string" },
                winner_blueprint: {
                  type: "object",
                  properties: {
                    duration_seconds: { type: "number" },
                    primary_hook_type: { type: "string" },
                    primary_hook_label: { type: "string" },
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
                    estructura_del_guion: { type: "object" },
                    analisis_estructura_persuasiva: { type: "object" },
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
                      required: ["gender_presentation", "approx_age_band", "creator_archetype", "presence_style", "market_context"],
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
                  required: ["duration_seconds", "primary_hook_type", "core_emotion", "energy_profile", "cta_style", "scene_type", "camera_style", "actor_profile_observed", "scene_geometry", "beat_timeline", "guion_original_completo"],
                },
                variants: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      variant_id: { type: "string" },
                      identity_distance: { type: "string" },
                      variant_summary: { type: "string" },
                      actor_archetype: { type: "string" },
                      identity_replacement_rules: { type: "array", items: { type: "string" } },
                      image_generation_strategy: { type: "array", items: { type: "string" } },
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
                          delivery_style: { type: "string" },
                          pace: { type: "string" },
                          energy: { type: "string" },
                          facial_expression: { type: "string" },
                          gesture_style: { type: "string" },
                        },
                        required: ["delivery_style", "pace", "energy", "facial_expression", "gesture_style"],
                      },
                      negative_prompt: { type: "string" },
                      animation_prompt_json: { type: "object" },
                      similarity_check_result: {
                        type: "object",
                        properties: {
                          against_original: { type: "string" },
                          cross_variant_diversity: { type: "string" },
                          product_lock: { type: "string" },
                          mechanics_preserved: { type: "string" },
                          notes: { type: "array", items: { type: "string" } },
                        },
                        required: ["against_original", "cross_variant_diversity", "product_lock", "mechanics_preserved", "notes"],
                      },
                      status: { type: "string" },
                      generation_attempt: { type: "number" },
                    },
                    required: [
                      "variant_id", "identity_distance", "variant_summary", "actor_archetype",
                      "actor_visual_direction", "script_variant", "scene_geometry",
                      "base_image_prompt_9x16", "heygen_ready_brief", "negative_prompt",
                      "animation_prompt_json", "similarity_check_result", "status", "generation_attempt",
                    ],
                  },
                },
              },
              required: ["input_mode", "has_voice", "content_type", "overlay_cleanup_required", "winner_blueprint", "variants"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analysis_result" } },
    };

    let toolCall: any = null;
    let lastError = "";

    for (const model of models) {
      console.log(`[analyze-video] Trying model: ${model}`, { hasCover: !!cover_url, hasProduct: !!product_image_url, numVariants, lang, diversity, videoDuration });

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...requestBody, model }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[analyze-video] ${model} HTTP error:`, response.status, errText);
        if (response.status === 429) {
          lastError = "Demasiadas solicitudes. Intenta de nuevo en un momento.";
          continue; // try next model
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `AI gateway error: ${response.status}`;
        continue;
      }

      const rawAiText = await response.text();
      console.log(`[analyze-video] ${model} response length:`, rawAiText.length, "chars");

      let aiData: any;
      try {
        aiData = JSON.parse(rawAiText);
      } catch {
        console.error(`[analyze-video] ${model} JSON parse failed. Length:`, rawAiText.length);
        lastError = `Respuesta del modelo incompleta (${rawAiText.length} chars). Intenta reducir variantes a 2.`;
        continue;
      }

      // Check for in-stream rate limit errors (HTTP 200 but 429 inside choices)
      const choiceError = aiData.choices?.[0]?.error;
      if (choiceError?.code === 429) {
        console.warn(`[analyze-video] ${model} returned in-stream 429, trying next model...`);
        lastError = "Rate limit del modelo. Reintentando con modelo alternativo.";
        continue;
      }

      toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        console.error(`[analyze-video] ${model} no tool call. Keys:`, Object.keys(aiData.choices?.[0]?.message || {}));
        lastError = "El modelo no devolvió datos estructurados.";
        continue;
      }

      console.log(`[analyze-video] Success with model: ${model}`);
      break;
    }

    if (!toolCall) {
      throw new Error(lastError || "AI did not return structured data after trying all models");
    }

    let result: any;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch (parseErr2) {
      console.error("[analyze-video] Failed to parse tool_call arguments. Length:", toolCall.function.arguments?.length, "Last 200 chars:", toolCall.function.arguments?.substring(toolCall.function.arguments.length - 200));
      throw new Error(`El análisis del modelo llegó truncado (${toolCall.function.arguments?.length || 0} chars en arguments). Intenta con 2 variantes o reinténtalo.`);
    }

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
