import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      reference_image_url,
      product_image_url,
      context,
      script,
      target_platform = "higgsfield",
      duration = 15,
      language = "es-MX",
      accent = "mexicano",
      creative_type = "recomendación",
      energy = "casual",
      camera_style = "selfie",
      overlay_policy = "none",
      graphics_policy = "none",
      realism = "maximum",
      product_lock = true,
      language_lock = true,
      delivery = "casual",
    } = body;

    if (!reference_image_url) throw new Error("reference_image_url is required");
    if (!script) throw new Error("script is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ── Language lock block ──
    const langBlock = language_lock
      ? `
LANGUAGE LOCK — HIGHEST PRIORITY — NON-NEGOTIABLE:
- ALL spoken dialogue MUST be in ${language} (${accent}) ONLY
- Do NOT generate English dialogue under any circumstance
- Do NOT default to English for CTA, narration, or any text
- Do NOT use neutral corporate Spanish — use authentic ${accent} vocabulary and tone
- Do NOT translate any part of the script into English
- Forbid: English, Portuguese, neutral Spanish, any non-${language} language
- The actor MUST speak the exact script provided below in ${language}
- REPEAT: No English. No translation. ${language} only. ${accent} accent only.
- Every spoken word must be in ${language}. This is absolute.`
      : "";

    const productBlock = product_image_url
      ? `
PRODUCT LOCK:
- A product reference image is provided as GROUND TRUTH
- Match EXACT packaging, color, shape, label, branding
- Do NOT reinterpret or redesign the product
- The product must appear naturally integrated in the scene`
      : "";

    const systemPrompt = `You are an expert Video Animation Blueprint Composer for external AI video platforms like Sora, Higgsfield, and similar tools.

Your job is to take a reference image, a spoken script, and context, then produce THREE outputs:

1. ANIMATION JSON — A comprehensive, hyper-detailed JSON blueprint ready to paste into ${target_platform}
2. VIDEO PROMPT — A long, detailed natural language prompt ready to paste into ${target_platform}
3. EXECUTION BLUEPRINT — A structured technical specification for the animation

CRITICAL CONTEXT:
- The reference image IS the actor identity. The video must animate THIS person.
- This is an IMAGE-TO-VIDEO workflow. The image is the first frame / anchor.
- The actor in the video must look like the person in the reference image.
- The video must be a UGC-style vertical clip, not cinematic.
- Duration: ${duration} seconds
- Target: ${target_platform}
- Creative type: ${creative_type}
- Energy: ${energy}
- Delivery: ${delivery}
- Camera: ${camera_style}
- Overlays: ${overlay_policy}
- Graphics: ${graphics_policy}
- Realism: ${realism}
${langBlock}
${productBlock}

CONTEXT FROM USER: ${context || "UGC product video for TikTok Shop"}

SPOKEN SCRIPT (the actor MUST say EXACTLY this):
${script}

SCRIPT PARSING RULES:
- If the script has structure markers like HOOK/BODY/CTA with timestamps, respect those exactly
- If it's plain text, infer hook (first 2-3s), body (middle), CTA (last 2-3s)
- Map each segment to the timeline

IMAGE-TO-VIDEO RULES:
- Use the attached reference image as the actor's visual identity
- Preserve: face, hair, skin tone, general age range, body type
- The video should feel like this person started recording and the still image came to life
- Animate naturally: breathing, micro-expressions, lip sync, natural gestures
- Do NOT change the actor's identity or appearance

OUTPUT FORMATTING RULES:
- The animation_json must be extremely detailed with every field populated
- The video_prompt must be a single long text, ready to paste, ultra-specific
- The execution_blueprint must be structured with clear sections
- All spoken content in ${language} (${accent})
- All technical/visual instructions in English`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `Generate the three outputs for this video animation.

Reference image (THIS IS THE ACTOR — animate this person):`,
      },
      { type: "image_url", image_url: { url: reference_image_url } },
    ];

    if (product_image_url) {
      userContent.push({ type: "text", text: "Product reference (match exactly):" });
      userContent.push({ type: "image_url", image_url: { url: product_image_url } });
    }

    userContent.push({
      type: "text",
      text: `Script to speak (EXACT words, in ${language}):
${script}

Context: ${context || "UGC product recommendation video"}
Duration: ${duration}s
Platform: ${target_platform}
Camera: ${camera_style}
Energy: ${energy}
Delivery: ${delivery}
Creative type: ${creative_type}

Generate ALL THREE outputs now: animation_json, video_prompt, and execution_blueprint.
Remember: ALL dialogue in ${language} (${accent}). NO English. The actor must say the script EXACTLY as written.`,
    });

    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "external_video_outputs",
            description: "Return the animation JSON, video prompt, and execution blueprint",
            parameters: {
              type: "object",
              properties: {
                animation_json: {
                  type: "object",
                  description: "Complete animation JSON blueprint for external platform",
                  properties: {
                    target_platform: { type: "string" },
                    mode: { type: "string" },
                    reference_image_required: { type: "boolean" },
                    duration_seconds: { type: "number" },
                    aspect_ratio: { type: "string" },
                    language_lock: {
                      type: "object",
                      properties: {
                        enabled: { type: "boolean" },
                        language: { type: "string" },
                        accent: { type: "string" },
                        forbid_english: { type: "boolean" },
                        forbid_portuguese: { type: "boolean" },
                        forbid_neutral_spanish: { type: "boolean" },
                        dialogue_must_match_script: { type: "boolean" },
                        dialogue_must_remain_in_language: { type: "boolean" },
                        cta_must_remain_in_language: { type: "boolean" },
                      },
                    },
                    product_lock: {
                      type: "object",
                      properties: {
                        enabled: { type: "boolean" },
                        match_packaging_exactly: { type: "boolean" },
                        match_color_exactly: { type: "boolean" },
                        match_shape_exactly: { type: "boolean" },
                        match_branding_exactly: { type: "boolean" },
                        do_not_reinvent_product: { type: "boolean" },
                      },
                    },
                    actor_identity: {
                      type: "object",
                      properties: {
                        use_attached_image_as_identity_reference: { type: "boolean" },
                        preserve_face: { type: "boolean" },
                        preserve_hair: { type: "boolean" },
                        preserve_skin_tone: { type: "boolean" },
                        preserve_general_age_range: { type: "boolean" },
                        preserve_body_type: { type: "boolean" },
                        identity_source: { type: "string" },
                      },
                    },
                    video_style: {
                      type: "object",
                      properties: {
                        ugc: { type: "boolean" },
                        smartphone: { type: "boolean" },
                        not_cinematic: { type: "boolean" },
                        not_commercial: { type: "boolean" },
                        realism_level: { type: "string" },
                        camera_style: { type: "string" },
                        lighting: { type: "string" },
                        environment: { type: "string" },
                      },
                    },
                    spoken_script: {
                      type: "object",
                      properties: {
                        hook: { type: "string" },
                        body: { type: "string" },
                        cta: { type: "string" },
                        full_script: { type: "string" },
                        language: { type: "string" },
                        accent: { type: "string" },
                      },
                    },
                    scene_timeline: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          scene_number: { type: "number" },
                          start: { type: "number" },
                          end: { type: "number" },
                          type: { type: "string" },
                          action: { type: "string" },
                          spoken_text: { type: "string" },
                          emotion: { type: "string" },
                          facial_expression: { type: "string" },
                          gesture: { type: "string" },
                          body_posture: { type: "string" },
                          camera_shot: { type: "string" },
                          camera_movement: { type: "string" },
                          product_visible: { type: "boolean" },
                          product_placement: { type: "string" },
                          gaze_direction: { type: "string" },
                          micro_actions: { type: "array", items: { type: "string" } },
                          transition_to_next: { type: "string" },
                          continuity_note: { type: "string" },
                        },
                      },
                    },
                    gesture_direction: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          timestamp: { type: "string" },
                          gesture: { type: "string" },
                          purpose: { type: "string" },
                        },
                      },
                    },
                    negative_constraints: { type: "array", items: { type: "string" } },
                    negative_language_constraints: { type: "array", items: { type: "string" } },
                    continuity_rules: { type: "array", items: { type: "string" } },
                    overlay_policy: { type: "string" },
                    graphics_policy: { type: "string" },
                    subtitle_policy: { type: "string" },
                    platform_notes: { type: "string" },
                  },
                  required: [
                    "target_platform", "mode", "duration_seconds", "aspect_ratio",
                    "language_lock", "actor_identity", "video_style",
                    "spoken_script", "scene_timeline", "negative_constraints",
                  ],
                },
                video_prompt: {
                  type: "string",
                  description: "A long, ultra-detailed natural language video prompt ready to paste into the target platform. Must include ALL instructions: actor identity from image, exact script, gestures, timing, camera, style, language lock, negative constraints. Should be 500+ words.",
                },
                execution_blueprint: {
                  type: "object",
                  description: "Structured execution specification",
                  properties: {
                    actor: {
                      type: "object",
                      properties: {
                        identity_source: { type: "string" },
                        age_range: { type: "string" },
                        appearance_notes: { type: "string" },
                        energy: { type: "string" },
                        delivery_style: { type: "string" },
                      },
                    },
                    timing: {
                      type: "object",
                      properties: {
                        total_duration: { type: "number" },
                        hook_end: { type: "number" },
                        body_end: { type: "number" },
                        cta_start: { type: "number" },
                        beats: { type: "array", items: { type: "object", properties: { label: { type: "string" }, start: { type: "number" }, end: { type: "number" } } } },
                      },
                    },
                    shots: { type: "array", items: { type: "object", properties: { shot_type: { type: "string" }, start: { type: "number" }, end: { type: "number" }, description: { type: "string" } } } },
                    gestures: { type: "array", items: { type: "object", properties: { timestamp: { type: "string" }, gesture: { type: "string" }, purpose: { type: "string" } } } },
                    spoken_script_structured: {
                      type: "object",
                      properties: {
                        hook: { type: "string" },
                        body: { type: "string" },
                        cta: { type: "string" },
                      },
                    },
                    scene_behavior: { type: "array", items: { type: "string" } },
                    language_lock_summary: { type: "string" },
                    visual_constraints: { type: "array", items: { type: "string" } },
                    negative_constraints: { type: "array", items: { type: "string" } },
                  },
                  required: ["actor", "timing", "shots", "spoken_script_structured", "language_lock_summary"],
                },
              },
              required: ["animation_json", "video_prompt", "execution_blueprint"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "external_video_outputs" } },
    };

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
    let toolCall: any = null;
    let lastError = "";

    for (const model of models) {
      console.log(`[compose-external-video] Trying model: ${model}`);

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
        console.error(`[compose-external-video] ${model} error:`, response.status, errText);
        if (response.status === 429) { lastError = "Rate limit."; continue; }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `AI gateway error: ${response.status}`;
        continue;
      }

      const rawText = await response.text();
      console.log(`[compose-external-video] ${model} response length:`, rawText.length);

      let aiData: any;
      try { aiData = JSON.parse(rawText); } catch {
        lastError = `Respuesta incompleta (${rawText.length} chars).`;
        continue;
      }

      if (aiData.choices?.[0]?.error?.code === 429) { lastError = "Rate limit."; continue; }

      toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) { lastError = "No structured data."; continue; }

      console.log(`[compose-external-video] Success with: ${model}`);
      break;
    }

    if (!toolCall) throw new Error(lastError || "No structured data from AI");

    let result: any;
    try { result = JSON.parse(toolCall.function.arguments); } catch {
      result = { error: "Failed to parse AI response" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[compose-external-video] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
