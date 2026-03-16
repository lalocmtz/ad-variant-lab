import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      video_urls,
      product_image_url,
      notes,
      language,
      script_count,
      script_style,
      cta_style,
      realism_mode,
    } = await req.json();

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0) {
      throw new Error("Se requiere al menos 1 URL de video");
    }
    if (video_urls.length > 3) throw new Error("Máximo 3 URLs");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const numScripts = Math.min(Math.max(script_count || 5, 1), 10);

    const videoList = video_urls.map((u: string, i: number) => `Video ${i + 1}: ${u}`).join("\n");

    const systemPrompt = `You are an elite TikTok Shop Winning Pattern Analyzer and HeyGen Script Generator.

Your job:
1. Analyze ${video_urls.length} winning TikTok Shop video(s) MILIMETRICALLY
2. Extract what ACTUALLY WORKS across them — hooks, structures, claims, CTAs, tones, visual patterns
3. Synthesize a CROSS-VIDEO winning pattern report
4. Generate ${numScripts} READY-TO-USE scripts for HeyGen based on the winning patterns

LANGUAGE RULES (CRITICAL):
- ALL scripts, dialogue, hooks, CTAs MUST be in ${lang}
- Do NOT generate English content for scripts
- Do NOT use neutral corporate Spanish — use authentic ${lang === "es-MX" ? "Mexican" : lang} vocabulary
- Technical analysis labels can be in English, but all creative output in ${lang}

TIKTOK SHOP COMPLIANCE:
- No medical claims or cures
- No before/after comparisons
- Focus on personal experience, social proof, urgency, demonstrable benefits
- No absolute result guarantees

SCRIPT REQUIREMENTS:
Each script must be:
- Complete and ready to copy-paste into HeyGen
- 15-30 seconds when spoken naturally
- Include a clear hook (first 2 seconds)
- Include body with demonstration/testimonial
- Include CTA
- Feel like authentic UGC creator content
- Based on patterns that WORKED in the source videos
${script_style ? `Script style preference: ${script_style}` : ""}
${cta_style ? `CTA style preference: ${cta_style}` : ""}

SCRIPT VARIETY:
Generate diverse angles. Suggested types:
1. Closest to winning pattern
2. More aggressive/urgent variation
3. More emotional/testimonial variation
4. Problem → solution variation
5. CTA-first / hook-heavy variation
6. Social proof / trend variation
7. Before discovery / after discovery (no visual before/after)
8. Fear of missing out
9. Review / honest opinion style
10. Tutorial / how-to style

${notes ? `OPERATOR NOTES: ${notes}` : ""}

Return structured data via tool call.`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    userContent.push({
      type: "text",
      text: `Analyze these winning TikTok Shop videos and generate ${numScripts} HeyGen-ready scripts.

${videoList}

Language: ${lang}
Number of scripts: ${numScripts}

Extract from each video:
- Hook type and exact phrasing pattern
- Narrative structure (problem→solution, testimonial, demo, etc.)
- Creator type/archetype
- Voice delivery style
- CTA phrasing and style
- Editing rhythm and shot types
- How the product appears and is demonstrated
- Claims and benefits mentioned
- Emotional tone and energy
- What makes each video WORK virally

Then SYNTHESIZE across all videos to find:
- Common winning patterns
- Most effective hook styles
- Most effective CTA styles
- Creator archetype that works best
- Visual patterns that repeat
- Product integration patterns

Finally, generate ${numScripts} complete scripts ready for HeyGen.`,
    });

    if (product_image_url) {
      userContent.push({
        type: "text",
        text: "Product reference image — scripts must reference this exact product naturally:",
      });
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
            name: "aigen_analysis",
            description: "Return the cross-video analysis, winning patterns, and HeyGen scripts",
            parameters: {
              type: "object",
              properties: {
                video_analyses: {
                  type: "array",
                  description: "Individual analysis per video",
                  items: {
                    type: "object",
                    properties: {
                      video_url: { type: "string" },
                      hook_type: { type: "string" },
                      hook_text: { type: "string" },
                      narrative_structure: { type: "string" },
                      creator_archetype: { type: "string" },
                      voice_delivery: { type: "string" },
                      cta_text: { type: "string" },
                      cta_style: { type: "string" },
                      editing_rhythm: { type: "string" },
                      shot_types: { type: "array", items: { type: "string" } },
                      product_integration: { type: "string" },
                      claims: { type: "array", items: { type: "string" } },
                      emotional_tone: { type: "string" },
                      energy_level: { type: "string" },
                      estimated_duration: { type: "number" },
                      winning_elements: { type: "array", items: { type: "string" } },
                    },
                    required: ["video_url", "hook_type", "narrative_structure", "winning_elements"],
                  },
                },
                winning_patterns: {
                  type: "object",
                  description: "Cross-video synthesis of what works",
                  properties: {
                    hook_patterns: { type: "array", items: { type: "string" } },
                    script_patterns: { type: "array", items: { type: "string" } },
                    cta_patterns: { type: "array", items: { type: "string" } },
                    visual_patterns: { type: "array", items: { type: "string" } },
                    creator_archetypes: { type: "array", items: { type: "string" } },
                    product_integration_patterns: { type: "array", items: { type: "string" } },
                    emotional_patterns: { type: "array", items: { type: "string" } },
                    winning_structure_summary: { type: "string" },
                    recommended_duration_seconds: { type: "number" },
                  },
                  required: ["hook_patterns", "script_patterns", "cta_patterns", "winning_structure_summary"],
                },
                scripts: {
                  type: "array",
                  description: "Ready-to-use HeyGen scripts",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short descriptive title" },
                      angle: { type: "string", description: "The creative angle used" },
                      hook: { type: "string", description: "The opening hook line" },
                      full_script: { type: "string", description: "Complete spoken script ready to paste in HeyGen" },
                      cta: { type: "string", description: "The closing CTA" },
                      performance_notes: { type: "string", description: "Why this script should work" },
                      estimated_duration_seconds: { type: "number" },
                      delivery_style: { type: "string", description: "How to deliver: excited, calm, concerned, etc." },
                      based_on_pattern: { type: "string", description: "Which winning pattern this derives from" },
                    },
                    required: ["title", "angle", "hook", "full_script", "cta", "estimated_duration_seconds", "delivery_style"],
                  },
                },
                image_generation_hints: {
                  type: "object",
                  description: "Hints for generating UGC base images",
                  properties: {
                    recommended_poses: { type: "array", items: { type: "string" } },
                    recommended_environments: { type: "array", items: { type: "string" } },
                    recommended_expressions: { type: "array", items: { type: "string" } },
                    product_visibility_style: { type: "string" },
                    creator_look_description: { type: "string" },
                    dominant_shot_type: { type: "string" },
                  },
                },
              },
              required: ["video_analyses", "winning_patterns", "scripts", "image_generation_hints"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "aigen_analysis" } },
    };

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
    let toolCall: any = null;
    let lastError = "";

    for (const model of models) {
      console.log(`[analyze-aigen-videos] Trying model: ${model}`);

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
        console.error(`[analyze-aigen-videos] ${model} error:`, response.status, errText);
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
      console.log(`[analyze-aigen-videos] ${model} response length:`, rawText.length);

      let aiData: any;
      try { aiData = JSON.parse(rawText); } catch {
        lastError = `Respuesta incompleta del modelo (${rawText.length} chars).`;
        continue;
      }

      if (aiData.choices?.[0]?.error?.code === 429) { lastError = "Rate limit del modelo."; continue; }

      toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) { lastError = "El modelo no devolvió datos estructurados."; continue; }

      console.log(`[analyze-aigen-videos] Success with: ${model}`);
      break;
    }

    if (!toolCall) throw new Error(lastError || "No structured data from AI");

    let result: any;
    try { result = JSON.parse(toolCall.function.arguments); } catch {
      throw new Error("Error parseando respuesta del modelo.");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-aigen-videos error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
