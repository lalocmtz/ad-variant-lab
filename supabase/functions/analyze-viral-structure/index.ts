import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      video_url,
      product_image_url,
      notes,
      target_duration,
      language,
      target_platform,
      product_lock_enabled,
      language_lock_enabled,
      realism_level,
      variation_level,
    } = await req.json();

    if (!video_url) throw new Error("video_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const maxDuration = target_duration || 12;
    const platform = target_platform || "generic";
    const productLock = product_lock_enabled !== false;
    const langLock = language_lock_enabled !== false;
    const realismLvl = realism_level || "maximum";
    const variationLvl = variation_level || "moderate";

    const productBlock = product_image_url
      ? `\nPRODUCT REFERENCE IMAGE PROVIDED (GROUND TRUTH):
The user uploaded a product image. This is the SINGLE SOURCE OF TRUTH for the product.
- Match the EXACT packaging, color palette, shape, silhouette, label layout, branding
- Do NOT reinterpret, simplify, redesign, or approximate the product
- product_lock must be enabled with all fields true
- Include a detailed product_description based on what you see`
      : "";

    const notesBlock = notes ? `\nOPERATOR NOTES: ${notes}` : "";

    const langLockBlock = langLock
      ? `\nLANGUAGE LOCK (CRITICAL — HIGHEST PRIORITY):
- ALL spoken dialogue MUST be in ${lang} ONLY
- Do NOT generate English dialogue under any circumstance
- Do NOT default to English for CTA, narration, or any text
- Do NOT use neutral corporate Spanish — use authentic ${lang === "es-MX" ? "Mexican" : lang} vocabulary and tone
- Do NOT translate CTA into English
- Forbid: English, Portuguese, neutral Spanish, any non-${lang} language
- This applies to: dialogue, spoken_lines, CTA text, on-screen text, narration
- Repeat this constraint in the language_lock object AND in each scene's dialogue field`
      : "";

    const platformHints: Record<string, string> = {
      sora: "Optimize for Sora: focus on cinematic scene descriptions, camera movements, and clear visual continuity. Include a ready-to-paste sora_prompt.",
      higgsfield: "Optimize for Higgsfield: focus on actor actions, facial expressions, body language, and spoken dialogue timing. Include a ready-to-paste higgsfield_prompt.",
      generic: "Generate a platform-agnostic JSON with maximum detail for both scene description and actor performance.",
    };

    const systemPrompt = `You are an elite Viral Video Reverse Engineering Engine + JSON Blueprint Composer.

Your job: Analyze a video URL and extract its COMPLETE viral structure, then output a hyper-detailed JSON blueprint that allows someone to recreate the video's LOGIC and STRUCTURE (not an exact copy) in AI video generators.

TARGET PLATFORM: ${platform}
${platformHints[platform] || platformHints.generic}

CRITICAL RULES:
1. Analyze the video MILIMETRICALLY — every scene, cut, camera move, expression, gesture, dialogue, micro-action
2. Extract the WINNING PATTERN — why this video works virally
3. Compress to ${maxDuration} seconds maximum while preserving ALL viral elements
4. Apply STRUCTURAL CLONE + CONTEXT VARIATION: same structure, different context
5. All dialogue/scripts MUST be in ${lang} — this is NON-NEGOTIABLE
6. All visual/technical instructions in English
7. Be EXTREMELY specific — every 0.5 second matters
8. Include spoken_lines array with exact dialogue text and timestamps
9. Realism level: ${realismLvl}

COMPRESSION RULES (if original > ${maxDuration}s):
- Detect repeated/redundant segments → remove
- Detect filler/transitions → remove
- Keep ONLY: hook, core demo/argument, payoff, CTA
- Redistribute timing to fill exactly ${maxDuration} seconds
- Document what was removed and kept in compression_report

STRUCTURAL CLONE + CONTEXT VARIATION POLICY:
Variation level: ${variationLvl}
MAINTAIN (non-negotiable): narrative structure, pacing logic, shot types, product placement, emotional arc, hook mechanics, CTA logic, scene order, energy level, persuasion sequence
VARY: background details, actor identity (different person), clothing style, secondary props, exact camera angle, environmental colors
DO NOT clone the exact video — create a structural replica with fresh context
${productBlock}
${notesBlock}
${langLockBlock}

OUTPUT: Return a SINGLE comprehensive JSON via the tool call. The JSON must be detailed enough to reconstruct the full video.`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze this video and generate a complete viral recreation JSON blueprint.
Video URL: ${video_url}
Target duration: ${maxDuration} seconds
Language: ${lang}
Target platform: ${platform}
Realism: ${realismLvl}
Variation: ${variationLvl}

Extract EVERYTHING: timeline, scenes, camera, lighting, actor, dialogue with exact spoken lines, emotions, micro-gestures, editing rhythm, hook type, CTA, product integration, negative constraints, continuity rules.

IMPORTANT: All dialogue text must be in ${lang}. Do not use English for any spoken content.`,
    });

    if (product_image_url) {
      userContent.push({ type: "text", text: "Product reference image (ABSOLUTE GROUND TRUTH — match exactly, do not reinterpret):" });
      userContent.push({ type: "image_url", image_url: { url: product_image_url } });
    }

    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "viral_video_json",
            description: "Return the complete viral video recreation JSON blueprint with language_lock, product_lock, variation_policy, spoken_lines, and platform-specific prompts",
            parameters: {
              type: "object",
              properties: {
                target_platform: { type: "string" },
                video_type: { type: "string" },
                original_duration_seconds: { type: "number" },
                compressed_duration_seconds: { type: "number" },
                aspect_ratio: { type: "string" },
                dialogue_mode: { type: "string", description: "exact_dialogue | guided_dialogue | no_dialogue" },
                realism_level: { type: "string" },
                compression_report: {
                  type: "object",
                  properties: {
                    segments_removed: { type: "array", items: { type: "string" } },
                    segments_kept: { type: "array", items: { type: "string" } },
                    compression_ratio: { type: "string" },
                  },
                },
                language_lock: {
                  type: "object",
                  properties: {
                    enabled: { type: "boolean" },
                    language: { type: "string" },
                    accent: { type: "string" },
                    forbid_english: { type: "boolean" },
                    forbid_portuguese: { type: "boolean" },
                    forbid_neutral_spanish: { type: "boolean" },
                    dialogue_must_remain_in_language: { type: "boolean" },
                    cta_must_remain_in_language: { type: "boolean" },
                    onscreen_text_language: { type: "string" },
                  },
                  required: ["enabled", "language"],
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
                    product_description: { type: "string" },
                  },
                  required: ["enabled"],
                },
                actor_strategy: {
                  type: "object",
                  properties: {
                    keep_pose_and_framing: { type: "boolean" },
                    keep_hook_positioning: { type: "boolean" },
                    same_action_different_person: { type: "boolean" },
                    allow_face_variation: { type: "boolean" },
                    maintain_body_language: { type: "boolean" },
                    original_actor_description: { type: "string" },
                  },
                },
                variation_policy: {
                  type: "object",
                  properties: {
                    same_structure: { type: "boolean" },
                    same_timing: { type: "boolean" },
                    same_energy: { type: "boolean" },
                    change_background_slightly: { type: "boolean" },
                    change_actor_identity: { type: "boolean" },
                    change_secondary_props: { type: "boolean" },
                    do_not_clone_exact_video: { type: "boolean" },
                    variation_level: { type: "string" },
                  },
                },
                viral_structure: {
                  type: "object",
                  properties: {
                    hook_type: { type: "string" },
                    narrative_framework: { type: "string" },
                    attention_peaks: { type: "array", items: { type: "object", properties: { timestamp: { type: "string" }, reason: { type: "string" } } } },
                    editing_rhythm: { type: "string" },
                    product_appearance_moments: { type: "array", items: { type: "string" } },
                    cta_style: { type: "string" },
                    winning_elements: { type: "array", items: { type: "string" } },
                    persuasion_triggers: { type: "array", items: { type: "string" } },
                  },
                  required: ["hook_type", "narrative_framework", "editing_rhythm", "cta_style", "winning_elements"],
                },
                style: {
                  type: "object",
                  properties: {
                    camera: { type: "string" },
                    lighting: { type: "string" },
                    environment: { type: "string" },
                    realism_level: { type: "string" },
                    color_palette: { type: "string" },
                    audio_style: { type: "string" },
                    ambient_sound: { type: "string" },
                  },
                },
                actor: {
                  type: "object",
                  properties: {
                    gender: { type: "string" },
                    age_range: { type: "string" },
                    ethnicity: { type: "string" },
                    appearance: { type: "string" },
                    makeup: { type: "string" },
                    wardrobe: { type: "string" },
                    energy: { type: "string" },
                    communication_style: { type: "string" },
                  },
                },
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      scene_number: { type: "number" },
                      start: { type: "number" },
                      end: { type: "number" },
                      type: { type: "string" },
                      camera_shot: { type: "string" },
                      camera_movement: { type: "string" },
                      action: { type: "string" },
                      micro_actions: { type: "array", items: { type: "string" } },
                      dialogue: { type: "string" },
                      spoken_language: { type: "string" },
                      emotion: { type: "string" },
                      facial_expression: { type: "string" },
                      gaze_direction: { type: "string" },
                      gesture: { type: "string" },
                      body_posture: { type: "string" },
                      product_visible: { type: "boolean" },
                      product_placement: { type: "string" },
                      lighting_note: { type: "string" },
                      transition_to_next: { type: "string" },
                      persuasion_purpose: { type: "string" },
                      continuity_note: { type: "string" },
                    },
                    required: ["scene_number", "start", "end", "type", "camera_shot", "action"],
                  },
                },
                spoken_lines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: { type: "number" },
                      end: { type: "number" },
                      text: { type: "string" },
                      emotion: { type: "string" },
                      language: { type: "string" },
                    },
                  },
                },
                product_integration: {
                  type: "object",
                  properties: {
                    visibility: { type: "string" },
                    placement: { type: "string" },
                    close_up_scenes: { type: "array", items: { type: "number" } },
                    label_visible: { type: "boolean" },
                    handling_description: { type: "string" },
                  },
                },
                product_reference: {
                  type: "object",
                  properties: {
                    match_exact_packaging: { type: "boolean" },
                    show_label_clearly: { type: "boolean" },
                    do_not_modify_color_or_shape: { type: "boolean" },
                    product_description: { type: "string" },
                  },
                },
                context_variations: {
                  type: "object",
                  properties: {
                    background_change: { type: "string" },
                    wardrobe_change: { type: "string" },
                    angle_change: { type: "string" },
                    props_change: { type: "string" },
                    actor_change: { type: "string" },
                  },
                },
                continuity_rules: { type: "array", items: { type: "string" } },
                negative_constraints: { type: "array", items: { type: "string" } },
                platform_notes: { type: "string" },
                sora_prompt: { type: "string" },
                higgsfield_prompt: { type: "string" },
                hook_frame_description: { type: "string", description: "Detailed description of the ideal first frame / hook frame for reference image generation" },
              },
              required: [
                "target_platform", "video_type", "original_duration_seconds", "compressed_duration_seconds",
                "aspect_ratio", "language_lock", "product_lock", "variation_policy",
                "viral_structure", "scenes", "negative_constraints",
                "sora_prompt", "higgsfield_prompt", "hook_frame_description",
              ],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "viral_video_json" } },
    };

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
    let toolCall: any = null;
    let lastError = "";

    for (const model of models) {
      console.log(`[analyze-viral-structure] Trying model: ${model}`);

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
        console.error(`[analyze-viral-structure] ${model} error:`, response.status, errText);
        if (response.status === 429) { lastError = "Rate limit. Intenta de nuevo en un momento."; continue; }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `AI gateway error: ${response.status}`;
        continue;
      }

      const rawText = await response.text();
      console.log(`[analyze-viral-structure] ${model} response length:`, rawText.length);

      let aiData: any;
      try { aiData = JSON.parse(rawText); } catch {
        lastError = `Respuesta incompleta del modelo (${rawText.length} chars).`;
        continue;
      }

      if (aiData.choices?.[0]?.error?.code === 429) { lastError = "Rate limit del modelo."; continue; }

      toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) { lastError = "El modelo no devolvió datos estructurados."; continue; }

      console.log(`[analyze-viral-structure] Success with: ${model}`);
      break;
    }

    if (!toolCall) throw new Error(lastError || "No structured data from AI");

    let result: any;
    try { result = JSON.parse(toolCall.function.arguments); } catch {
      throw new Error(`Respuesta truncada del modelo (${toolCall.function.arguments?.length || 0} chars).`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-viral-structure error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
