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

    const systemPrompt = `You are an expert TikTok Shop ad analyst and variant generator for video ad production.

Your job:
1. Analyze the structure of the original TikTok video (based on URL and metadata provided)
2. Generate a source blueprint of the original video
3. Create ${numVariants} controlled variants, each with a DIFFERENT actor/environment but the SAME structure

CRITICAL RULES:
- ALL image prompts (base_image_prompt_9x16) and motion prompts (hisfield_master_motion_prompt) and negative_prompt MUST be in ENGLISH
- The rest of the analysis (variant_summary, script, shotlist descriptions) should be in Spanish
- For each variant you MUST extract scene_geometry from the original video to ensure structural consistency

For scene_geometry, analyze the original video and provide:
- camera_distance: e.g. "medium_close", "close_up", "medium", "wide"
- product_hand: which hand holds the product, e.g. "right", "left", "both"
- product_position: where in frame, e.g. "center_right", "center", "lower_third"
- camera_angle: e.g. "eye_level", "slightly_above", "slightly_below"
- lighting_direction: e.g. "window_left", "window_right", "overhead", "natural_ambient"

For hisfield_master_motion_prompt, follow this EXACT structure:
---
VISUAL REFERENCE: use the generated image.
MOTION REFERENCE: use the original TikTok video.

Replicate the exact motion, timing, and gesture rhythm from the reference video.
The actor is different but the behavior must match the original performance.

Preserve:
- camera distance
- gesture rhythm
- product interaction timing
- pacing and beat structure

Replace:
- actor identity
- background details (same category of environment)

Maintain a natural handheld TikTok style.
Do not add logos or new text overlays.

[Include specific shot-by-shot timing from the shotlist]

If the source video is longer than 25 seconds, compress the sequence to 10-12 seconds while preserving the hook, demonstration, proof, and CTA structure.
---

Respond EXCLUSIVELY with the JSON using the tool "analysis_result".`;

    const userPrompt = `Analyze this TikTok Shop ad and generate ${numVariants} variants.

Video URL: ${video_url}
Metadata: ${JSON.stringify(metadata || {})}

For each variant generate:
- variant_id: letter A, B, C...
- variant_summary: short summary of the variant (Spanish)
- shotlist: array of shots with {shot, duration, description}
- script: {hook, body, cta} (Spanish)
- on_screen_text_plan: array of {timestamp, text}
- scene_geometry: {camera_distance, product_hand, product_position, camera_angle, lighting_direction} extracted from the original video
- base_image_prompt_9x16: ENGLISH prompt for hyper-realistic 9:16 image. Must use the STRICT SCENE RECONSTRUCTION format with all 7 locks (Product Lock, Scene Geometry Lock, Pose Lock, Identity Change Only, Ultra Realistic UGC Style, Product Priority, Natural Social Media Look). Include the scene_geometry data directly in the prompt.
- hisfield_master_motion_prompt: ENGLISH prompt for Kling Motion Control following the structure above
- negative_prompt: ENGLISH, what should NOT appear`;

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
                  input_mode: { type: "string" },
                  has_voice: { type: "boolean" },
                  content_type: { type: "string" },
                  source_blueprint: {
                    type: "object",
                    properties: {
                      duration_seconds: { type: "number" },
                      beat_timeline: { type: "array", items: { type: "string" } },
                      motion_signature: { type: "string" },
                      product_interaction: { type: "string" },
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
      console.error("No tool call in response:", JSON.stringify(aiData));
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
