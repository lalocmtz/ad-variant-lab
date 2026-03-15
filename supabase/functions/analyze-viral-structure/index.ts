import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, product_image_url, notes, target_duration, language } = await req.json();
    if (!video_url) throw new Error("video_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const maxDuration = target_duration || 12;

    const productBlock = product_image_url
      ? `\nPRODUCT REFERENCE IMAGE PROVIDED:
The user uploaded a product image. You MUST include a product_reference object in the JSON with:
- match_exact_packaging: true
- show_label_clearly: true  
- do_not_modify_color_or_shape: true
Describe the product exactly as seen in the reference image.`
      : "";

    const notesBlock = notes ? `\nOPERATOR NOTES: ${notes}` : "";

    const systemPrompt = `You are an elite Viral Video Reverse Engineering Engine.

Your job: Analyze a video URL and extract its COMPLETE viral structure, then output a hyper-detailed JSON blueprint that allows someone to recreate the video's LOGIC and STRUCTURE (not an exact copy) in Sora, Higgsfield, or any AI video generator.

CRITICAL RULES:
1. Analyze the video MILIMETRICALLY — every scene, cut, camera move, expression, gesture, dialogue
2. Extract the WINNING PATTERN — why this video works virally
3. Compress to ${maxDuration} seconds maximum while preserving ALL viral elements
4. Vary context slightly (background, clothing, angle, props) to avoid direct cloning
5. Keep the EXACT narrative structure, pacing logic, and persuasion mechanics
6. All dialogue/scripts in ${lang}
7. All visual instructions in English
8. Be EXTREMELY specific — every 0.5 second matters

COMPRESSION RULES (if original > ${maxDuration}s):
- Detect repeated/redundant segments → remove
- Detect filler/transitions → remove  
- Keep ONLY: hook, core demo/argument, payoff, CTA
- Redistribute timing to fill exactly ${maxDuration} seconds
- Preserve the RATIO of time spent on each viral element

CONTEXT VARIATION (anti-clone):
- Change: background details, clothing style, secondary props, exact camera angle
- Preserve: narrative structure, pacing, shot types, product placement logic, emotional arc
${productBlock}
${notesBlock}

OUTPUT FORMAT:
Return a SINGLE comprehensive JSON via tool call. The JSON must be copy-pasteable into Sora/Higgsfield.`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze this video and generate a complete viral recreation JSON blueprint.
Video URL: ${video_url}
Target duration: ${maxDuration} seconds
Language: ${lang}

Extract EVERYTHING: timeline, scenes, camera, lighting, actor, dialogue, emotions, micro-gestures, editing rhythm, hook type, CTA, product integration, and negative constraints.`,
    });

    if (product_image_url) {
      userContent.push({ type: "text", text: "Product reference image (GROUND TRUTH — match exactly):" });
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
            description: "Return the complete viral video recreation JSON blueprint",
            parameters: {
              type: "object",
              properties: {
                video_type: { type: "string", description: "e.g. UGC product recommendation, tutorial, testimonial" },
                original_duration_seconds: { type: "number" },
                compressed_duration_seconds: { type: "number" },
                aspect_ratio: { type: "string" },
                compression_report: {
                  type: "object",
                  properties: {
                    segments_removed: { type: "array", items: { type: "string" } },
                    segments_kept: { type: "array", items: { type: "string" } },
                    compression_ratio: { type: "string" },
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
                  required: ["camera", "lighting", "environment", "realism_level"],
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
                  required: ["gender", "age_range", "appearance", "energy"],
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
                      emotion: { type: "string" },
                      facial_expression: { type: "string" },
                      gaze_direction: { type: "string" },
                      gesture: { type: "string" },
                      product_visible: { type: "boolean" },
                      product_placement: { type: "string" },
                      lighting_note: { type: "string" },
                      transition_to_next: { type: "string" },
                      persuasion_purpose: { type: "string" },
                    },
                    required: ["scene_number", "start", "end", "type", "camera_shot", "action"],
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
                  },
                },
                negative_constraints: { type: "array", items: { type: "string" } },
                sora_prompt: { type: "string", description: "Ready-to-paste prompt optimized for Sora" },
                higgsfield_prompt: { type: "string", description: "Ready-to-paste prompt optimized for Higgsfield" },
              },
              required: [
                "video_type", "original_duration_seconds", "compressed_duration_seconds",
                "aspect_ratio", "viral_structure", "style", "actor", "scenes",
                "negative_constraints", "sora_prompt", "higgsfield_prompt",
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
        if (response.status === 429) {
          lastError = "Rate limit. Intenta de nuevo en un momento.";
          continue;
        }
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
      try {
        aiData = JSON.parse(rawText);
      } catch {
        console.error(`[analyze-viral-structure] ${model} JSON parse failed`);
        lastError = `Respuesta incompleta del modelo (${rawText.length} chars).`;
        continue;
      }

      const choiceError = aiData.choices?.[0]?.error;
      if (choiceError?.code === 429) {
        lastError = "Rate limit del modelo.";
        continue;
      }

      toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        lastError = "El modelo no devolvió datos estructurados.";
        continue;
      }

      console.log(`[analyze-viral-structure] Success with: ${model}`);
      break;
    }

    if (!toolCall) {
      throw new Error(lastError || "No structured data from AI");
    }

    let result: any;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch {
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
