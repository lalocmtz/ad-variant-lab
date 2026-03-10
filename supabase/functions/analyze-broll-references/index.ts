import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reference_covers, product_image_url, product_url } = await req.json();

    if (!reference_covers || reference_covers.length === 0) {
      throw new Error("At least one reference cover is required");
    }
    if (!product_image_url) {
      throw new Error("product_image_url is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build multimodal content with all reference covers + product image
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `You are analyzing ${reference_covers.length} reference TikTok product videos (via their cover frames) plus a product image. Your task is to synthesize common winning patterns across ALL references to create a creative brief for generating a BRAND NEW original product video from scratch.

IMPORTANT:
- Do NOT replicate any single reference literally
- Identify COMMON patterns, shots, and structures shared across references
- The product image is the ground-truth for the product's appearance
- The output will be used to generate a completely new, original video
${product_url ? `\nProduct URL for context: ${product_url}` : ""}

Analyze each reference and then synthesize.`,
      },
    ];

    // Add product image first
    userContent.push(
      { type: "text", text: "=== PRODUCT IMAGE (ground truth) ===" },
      { type: "image_url", image_url: { url: product_image_url } },
    );

    // Add each reference cover
    for (let i = 0; i < reference_covers.length; i++) {
      userContent.push(
        { type: "text", text: `=== REFERENCE VIDEO ${i + 1} COVER ===${reference_covers[i].metadata ? `\nMetadata: ${JSON.stringify(reference_covers[i].metadata)}` : ""}` },
        { type: "image_url", image_url: { url: reference_covers[i].cover_url } },
      );
    }

    const systemPrompt = `You are a creative strategist for TikTok Shop product ads. Analyze multiple reference video covers and a product image to create a creative synthesis.

RULES:
- Identify patterns COMMON across references (shots, actions, angles, environments, pacing, hooks)
- Do NOT copy any single reference literally
- The product image is the absolute truth for product appearance
- Output must enable generation of a NEW original product video
- Think like a creative director synthesizing winning patterns
- All text output in Spanish (Mexican Spanish)

You MUST respond using the synthesize_references tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_references",
              description: "Return a creative synthesis from analyzed reference videos",
              parameters: {
                type: "object",
                properties: {
                  product_detected: { type: "string", description: "Product name/type detected" },
                  common_shot_types: {
                    type: "array",
                    items: { type: "string" },
                    description: "Shot types that appear across multiple references (close-up, hands-on demo, unboxing, before/after, etc.)",
                  },
                  common_actions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Repeated product actions/interactions across references",
                  },
                  common_environments: {
                    type: "array",
                    items: { type: "string" },
                    description: "Environments/settings that appear frequently",
                  },
                  viral_structure: {
                    type: "string",
                    description: "The common ad structure pattern detected (e.g., hook → demo → reveal → CTA)",
                  },
                  hook_patterns: {
                    type: "array",
                    items: { type: "string" },
                    description: "Common hook visual patterns",
                  },
                  pacing: { type: "string", description: "Overall pacing style (fast/medium/slow)" },
                  commercial_energy: { type: "string", description: "The selling energy style detected" },
                  product_handling_style: { type: "string", description: "How the product is typically shown/handled" },
                  key_selling_moments: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key visual moments that sell the product",
                  },
                  master_image_prompt: {
                    type: "string",
                    description: "A detailed prompt to generate a NEW hyper-realistic product hero image synthesizing the common patterns. Must describe: the product (based on product image), the scene setup, camera angle, lighting, hands/interaction style, and environment. Should look like TikTok Shop UGC content. Prompt in English for image generation quality.",
                  },
                  master_video_prompt: {
                    type: "string",
                    description: "A detailed prompt to animate the master image into a short product demo video. Must describe: camera motion, product interaction, pacing, and style. Should feel like real TikTok Shop content. Prompt in English for video generation quality.",
                  },
                  scene_description_es: {
                    type: "string",
                    description: "Spanish description of what the generated video should show, for user display",
                  },
                },
                required: [
                  "product_detected",
                  "common_shot_types",
                  "common_actions",
                  "common_environments",
                  "viral_structure",
                  "hook_patterns",
                  "pacing",
                  "commercial_energy",
                  "product_handling_style",
                  "key_selling_moments",
                  "master_image_prompt",
                  "master_video_prompt",
                  "scene_description_es",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "synthesize_references" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo en un momento" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured data returned");

    const synthesis = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    console.log("Reference synthesis complete:", {
      product: synthesis.product_detected,
      shots: synthesis.common_shot_types?.length,
      actions: synthesis.common_actions?.length,
    });

    return new Response(JSON.stringify(synthesis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-broll-references error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Error analyzing references" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
