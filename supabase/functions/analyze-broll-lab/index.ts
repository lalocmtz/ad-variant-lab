import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { covers, product_image_url, product_url, language, accent, voice_tone, voice_count } = await req.json();

    if (!covers || covers.length === 0) throw new Error("At least one TikTok cover is required");
    if (!product_image_url) throw new Error("product_image_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const voiceCount = voice_count || 5;
    const tone = voice_tone || "conversational, energético, UGC natural";

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `Analyze ${covers.length} TikTok reference video covers and a product image. Generate a complete creative brief with 4 scene prompts and ${voiceCount} voice-over script variants.

Product URL: ${product_url || "N/A"}
Language: ${lang}
Accent: ${accent || "mexicano"}
Voice tone: ${tone}

RULES:
- Identify winning patterns across ALL references
- The product image is ground truth for appearance
- Generate 4 NEW scene prompts for image generation
- Generate ${voiceCount} distinct voice-over scripts
- All scripts in Spanish (Mexican Spanish)
- Each script variant must change hook, wording, and CTA but keep the same product promise`,
      },
      { type: "text", text: "=== PRODUCT IMAGE ===" },
      { type: "image_url", image_url: { url: product_image_url } },
    ];

    for (let i = 0; i < covers.length; i++) {
      userContent.push(
        { type: "text", text: `=== REFERENCE ${i + 1} ===${covers[i].title ? ` Title: ${covers[i].title}` : ""}` },
        { type: "image_url", image_url: { url: covers[i].cover_url } },
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a TikTok Shop creative strategist. Analyze references and create a complete production brief. Output MUST use the provided tool.`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_production_brief",
              description: "Return complete production brief with scenes and voice scripts",
              parameters: {
                type: "object",
                properties: {
                  product_detected: { type: "string" },
                  key_benefits: { type: "array", items: { type: "string" } },
                  common_hooks: { type: "array", items: { type: "string" } },
                  common_ctas: { type: "array", items: { type: "string" } },
                  visual_patterns: { type: "array", items: { type: "string" } },
                  ad_structure: { type: "string" },
                  summary_es: { type: "string", description: "Spanish summary of what the generated video will show" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        scene_index: { type: "number" },
                        label: { type: "string", description: "Short label like 'Product Reveal'" },
                        image_prompt: {
                          type: "string",
                          description: "Detailed prompt to generate a hyper-realistic 9:16 product image. Must describe: the exact product appearance (from product image), scene setup, camera angle, lighting, hands/interaction, environment. Style: TikTok Shop UGC, smartphone quality. NO text, NO overlays, NO UI elements. English prompt.",
                        },
                        motion_prompt: {
                          type: "string",
                          description: "Short prompt for subtle video animation: slow zoom, gentle pan, handheld drift. Keep product visible. English prompt.",
                        },
                      },
                      required: ["scene_index", "label", "image_prompt", "motion_prompt"],
                    },
                    minItems: 4,
                    maxItems: 4,
                  },
                  voice_scripts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_index: { type: "number" },
                        hook: { type: "string", description: "Opening hook phrase (Spanish)" },
                        body: { type: "string", description: "Main body text (Spanish)" },
                        cta: { type: "string", description: "Call to action (Spanish)" },
                        full_text: { type: "string", description: "Complete voice-over text (Spanish). Must be 10-15 seconds when spoken." },
                        tone: { type: "string", description: "Tone description for this variant" },
                      },
                      required: ["variant_index", "hook", "body", "cta", "full_text", "tone"],
                    },
                  },
                },
                required: ["product_detected", "key_benefits", "common_hooks", "common_ctas", "visual_patterns", "ad_structure", "summary_es", "scenes", "voice_scripts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_production_brief" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured data returned");

    const brief = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    console.log("Broll Lab analysis complete:", { product: brief.product_detected, scenes: brief.scenes?.length, scripts: brief.voice_scripts?.length });

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-broll-lab error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error analyzing references" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
