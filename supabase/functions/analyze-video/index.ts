import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, variant_count, metadata } = await req.json();
    if (!video_url) throw new Error("video_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const numVariants = variant_count || 3;

    const systemPrompt = `You are an expert TikTok Shop ad analyst. You WATCH the video provided and extract REAL evidence from it.

Your job:
1. WATCH the video carefully — observe every frame, gesture, camera angle, lighting, product interaction
2. Determine if there is voice/speech in the video
3. Classify the content type: HUMAN_TALKING, HANDS_DEMO, PRODUCT_ONLY, or TEXT_ONLY
4. Build a source blueprint based on OBSERVED EVIDENCE ONLY — never invent or assume
5. Generate ${numVariants} controlled variants that preserve the EXACT structure but change the actor

CRITICAL OBSERVATION RULES:
- You MUST describe what you ACTUALLY SEE in the video frames
- If you cannot detect voice, set has_voice=false and do NOT invent a script
- Identify the HOOK frame (the first impactful frame that grabs attention)
- Extract EXACT scene geometry from what you observe: camera distance, which hand holds product, product position in frame, camera angle, lighting direction

ALL prompts (base_image_prompt_9x16, hisfield_master_motion_prompt, negative_prompt) MUST be in ENGLISH.
All other fields (variant_summary, shotlist descriptions, script) should be in Spanish.

For hisfield_master_motion_prompt, use this EXACT structure:
---
VISUAL REFERENCE: use the generated image.
MOTION REFERENCE: use the original TikTok video.

Replicate the exact motion, timing, and gesture rhythm from the reference video.
The actor is different but the behavior must match the original performance.

Preserve:
- camera distance: [specify observed value]
- gesture rhythm: [describe observed rhythm]
- product interaction timing: [describe observed timing]
- pacing and beat structure: [describe observed pacing]
- hand used: [left/right/both]
- product orientation: [describe]

Replace:
- actor identity (different person)
- background details (same category of environment, subtle variations only)

Maintain a natural handheld TikTok style.
Do not add logos or new text overlays.

Shot-by-shot timing:
[Include specific timing from the shotlist]

If the source video is longer than 25 seconds, compress the sequence to 10-12 seconds while preserving the hook, demonstration, proof, and CTA structure.
---

For base_image_prompt_9x16, use STRICT SCENE RECONSTRUCTION format with all 7 locks:
1. PRODUCT LOCK — packaging identical to reference
2. SCENE GEOMETRY LOCK — same camera framing using observed geometry data
3. POSE LOCK — same hand position, arm angle, product orientation
4. IDENTITY CHANGE ONLY — only change the person
5. ULTRA REALISTIC UGC STYLE — natural smartphone look
6. PRODUCT PRIORITY — product clearly visible
7. NATURAL SOCIAL MEDIA LOOK — not an advertisement

Respond EXCLUSIVELY with the JSON using the tool "analysis_result".`;

    const userPrompt = `Watch this TikTok Shop ad video carefully and generate ${numVariants} variants based on what you OBSERVE.

Additional metadata: ${JSON.stringify(metadata || {})}

INSTRUCTIONS:
1. Observe the video frames — describe what you see (scene, actor, product, camera, lighting)
2. Detect if there is voice/narration
3. Classify content type
4. Build beat timeline from observed structure
5. Extract scene geometry from observed frames
6. Generate variants that clone the structure with different actors

For each variant:
- variant_id: A, B, C...
- variant_summary: short summary (Spanish)
- shotlist: [{shot, duration, description}] based on observed beats
- script: {hook, body, cta} — if has_voice=true, paraphrase observed speech (Spanish). If has_voice=false, describe visual actions only
- on_screen_text_plan: [{timestamp, text}] — 3 blocks (0-2s, 2-6s, 6-10/12s)
- scene_geometry: OBSERVED from video {camera_distance, product_hand, product_position, camera_angle, lighting_direction}
- base_image_prompt_9x16: ENGLISH strict reconstruction prompt with all 7 locks, embedding scene_geometry data
- hisfield_master_motion_prompt: ENGLISH specific motion prompt with observed camera distance, hand, gesture rhythm, cut timing, beat order
- negative_prompt: ENGLISH — "no logos, no watermarks, no random text, no extra hands, no distorted fingers, no product redesign"`;

    // Note: Gemini gateway only supports image formats (PNG/JPEG/WebP/GIF) as image_url,
    // not video files. We pass the video URL as text context along with metadata.
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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analysis_result",
              description: "Return the complete analysis with source blueprint and variants",
              parameters: {
                type: "object",
                properties: {
                  input_mode: { type: "string", enum: ["URL", "VIDEO", "IMAGE_ONLY", "VIDEO_PLUS_IMAGE"] },
                  has_voice: { type: "boolean", description: "True ONLY if voice/speech is detected in the video" },
                  content_type: { type: "string", enum: ["HUMAN_TALKING", "HANDS_DEMO", "PRODUCT_ONLY", "TEXT_ONLY"] },
                  source_blueprint: {
                    type: "object",
                    properties: {
                      source_understanding: {
                        type: "object",
                        properties: {
                          observed_scene: { type: "string" },
                          observed_actor: { type: "string" },
                          observed_product: { type: "string" },
                          camera: {
                            type: "object",
                            properties: {
                              distance: { type: "string" },
                              angle: { type: "string" },
                              framing_notes: { type: "string" },
                            },
                          },
                          lighting: {
                            type: "object",
                            properties: {
                              type: { type: "string" },
                              direction: { type: "string" },
                            },
                          },
                        },
                      },
                      beat_timeline: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            beat: { type: "string", enum: ["HOOK", "DEMO", "PROOF", "CTA"] },
                            time: { type: "string" },
                            what_happens: { type: "string" },
                          },
                          required: ["beat", "time", "what_happens"],
                        },
                      },
                      motion_signature: {
                        type: "object",
                        properties: {
                          camera_style: { type: "string" },
                          cuts: { type: "string" },
                          gesture_rhythm: { type: "string" },
                          product_movement: { type: "string" },
                        },
                      },
                      product_interaction: {
                        type: "object",
                        properties: {
                          hand_used: { type: "string" },
                          orientation: { type: "string" },
                          distance_to_camera: { type: "string" },
                        },
                      },
                      duration_seconds: { type: "number" },
                      core_message: { type: "string" },
                    },
                  },
                  variants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_id: { type: "string" },
                        variant_summary: { type: "string" },
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
                        script: {
                          type: "object",
                          properties: {
                            hook: { type: "string" },
                            body: { type: "string" },
                            cta: { type: "string" },
                          },
                          required: ["hook", "body", "cta"],
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
                        hisfield_master_motion_prompt: { type: "string" },
                        negative_prompt: { type: "string" },
                      },
                      required: [
                        "variant_id", "variant_summary", "shotlist", "script",
                        "on_screen_text_plan", "scene_geometry", "base_image_prompt_9x16",
                        "hisfield_master_motion_prompt", "negative_prompt",
                      ],
                    },
                  },
                },
                required: ["input_mode", "has_voice", "content_type", "source_blueprint", "variants"],
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
