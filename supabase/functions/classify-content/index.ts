import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cover_url, video_url, metadata } = await req.json();
    if (!cover_url) throw new Error("cover_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `Analyze this TikTok ad cover frame and classify the content mode.

TASK: Determine whether this video is:
1. "avatar" — A creator-led / avatar-led ad where a visible, identifiable person is consistently present and central to the ad. The persuasion relies on a visible human creator speaking to camera or demonstrating the product.
2. "product_broll" — A product-led B-roll ad where the product is the dominant visual subject. No consistent identifiable human creator is central. May include hands, environments, object demos, close-ups, but no persistent identifiable face driving the ad.
3. "mixed" — Ambiguous. Contains both creator presence and significant product B-roll sections.

HEURISTICS TO USE:
- Person visibility: Is a human face/body consistently visible and central?
- Face consistency: Is the same identifiable person present throughout?
- Product dominance: Is the product the main visual subject?
- Persuasion source: Does the ad rely on a visible creator's personality/trust, or on product visuals/demos?
- Hands-only content = product_broll (not avatar)
- Voiceover-only with product shots = product_broll
- Creator talking to camera = avatar
- Unboxing with face visible = avatar
- Close-up product demos without face = product_broll

Metadata: ${JSON.stringify(metadata || {})}`,
      },
      { type: "image_url", image_url: { url: cover_url } },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a video content classifier for TikTok ads. Return structured classification via the tool call." },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_content",
              description: "Classify the video content mode",
              parameters: {
                type: "object",
                properties: {
                  content_mode: {
                    type: "string",
                    enum: ["avatar", "product_broll", "mixed"],
                    description: "The detected content mode",
                  },
                  confidence: {
                    type: "number",
                    description: "Confidence score 0-1",
                  },
                  recommended_pipeline: {
                    type: "string",
                    enum: ["avatar_variants", "product_broll_voice_variants"],
                    description: "Which pipeline to use",
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why this classification was chosen (in Spanish)",
                  },
                  person_visibility_ratio: {
                    type: "number",
                    description: "Estimated ratio of frames with a visible identifiable person (0-1)",
                  },
                  product_visual_dominance: {
                    type: "number",
                    description: "How dominant the product is visually (0-1)",
                  },
                },
                required: ["content_mode", "confidence", "recommended_pipeline", "reasoning", "person_visibility_ratio", "product_visual_dominance"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_content" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Classification result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("classify-content error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Classification failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
