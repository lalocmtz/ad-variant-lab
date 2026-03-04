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

    const systemPrompt = `Eres un experto en análisis de anuncios de TikTok Shop y generación de variantes para video ads.

Tu trabajo:
1. Analizar la estructura del video original (basándote en la URL y metadata proporcionados)
2. Generar un blueprint del video fuente
3. Crear ${variant_count || 3} variantes controladas, cada una con diferente actor/ambiente pero MISMA estructura

IMPORTANTE: Los prompts de imagen y motion SIEMPRE en inglés. El resto del análisis puede ser en español.

Responde EXCLUSIVAMENTE con el JSON usando la tool "analysis_result".`;

    const userPrompt = `Analiza este anuncio de TikTok Shop y genera ${variant_count || 3} variantes.

Video URL: ${video_url}
Metadata: ${JSON.stringify(metadata || {})}

Para cada variante genera:
- variant_id: letra A, B, C...
- variant_summary: resumen corto de la variante
- shotlist: array de shots con {shot, duration, description}
- script: {hook, body, cta}
- on_screen_text_plan: array de {timestamp, text}
- base_image_prompt_9x16: prompt EN INGLÉS para generar imagen hiperrealista 9:16 estilo TikTok. Debe describir persona, iluminación, producto, ambiente. Calidad iPhone, estética TikTok.
- hisfield_master_motion_prompt: prompt EN INGLÉS para Kling Motion Control. Debe referenciar la imagen generada como VISUAL REFERENCE y el video original como MOTION REFERENCE. Incluir timing exacto de cada shot, ángulos de cámara, y texto en pantalla.
- negative_prompt: en inglés, lo que NO debe aparecer`;

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
                        base_image_prompt_9x16: { type: "string" },
                        hisfield_master_motion_prompt: { type: "string" },
                        negative_prompt: { type: "string" },
                      },
                      required: [
                        "variant_id", "variant_summary", "shotlist", "script",
                        "on_screen_text_plan", "base_image_prompt_9x16",
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
