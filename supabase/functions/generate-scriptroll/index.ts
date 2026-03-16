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
      product_url,
      price_before,
      price_now,
      language,
      script_count,
      script_style,
      tiktok_safe,
    } = await req.json();

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0)
      throw new Error("Se requiere al menos 1 URL de video de referencia");
    if (video_urls.length > 5) throw new Error("Máximo 5 URLs");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const numScripts = Math.min(Math.max(script_count || 5, 1), 10);
    const style = script_style || "cercano_al_original";

    const videoList = video_urls.map((u: string, i: number) => `Video ${i + 1}: ${u}`).join("\n");

    const priceContext = (price_before || price_now)
      ? `\nPRICING CONTEXT (integrate naturally into scripts):
- ${price_before ? `Precio anterior: ${price_before}` : ""}
- ${price_now ? `Precio actual: ${price_now}` : ""}
- Use phrases like "antes costaba X, hoy está en Y", "ahorita tiene descuento", "te sale mejor ahorita"
- Do NOT sound robotic about pricing — weave it naturally into the script flow`
      : "";

    const productContext = product_url
      ? `\nPRODUCT URL PROVIDED: ${product_url}
- Try to infer: product name, type, main benefit, usage context
- Use this context to make scripts more specific and credible`
      : "";

    const styleMap: Record<string, string> = {
      cercano_al_original: "Stay very close to the original winning pattern — same structure, similar hooks, matching rhythm",
      testimonial: "Write as personal testimonial — first person, genuine experience, surprise and satisfaction",
      problema_solucion: "Structure as problem→solution — identify a pain point, agitate, present the product as relief",
      directo_a_venta: "Direct selling approach — lead with the product benefit, go straight to the offer",
      oferta_urgencia: "Urgency/offer-driven — lead with scarcity, discount, limited time, FOMO",
      ugc_natural: "UGC casual style — sounds like talking to a friend, unscripted feel, authentic reactions",
    };
    const styleInstruction = styleMap[style] || styleMap.cercano_al_original;

    const tiktokSafeBlock = tiktok_safe !== false ? `
TIKTOK SHOP COMPLIANCE (CRITICAL — ANTI-BAN FILTER):
After generating each script, apply a TikTok-safe rewrite:
- REMOVE all medical claims, cure promises, guaranteed results, before-and-after comparisons
- REPLACE absolute claims with personal experience language ("a mí me funcionó", "yo noté cambios")
- KEEP persuasive power — just shift from medical claims to social proof and urgency
- For each script, include "safety_changes" listing what was modified
- Output "safe_version" (TikTok-safe rewrite) and "original_version" (pre-filter)
` : "";

    const systemPrompt = `You are an elite TikTok Script Miner and Script Generator.

YOUR MISSION:
1. Analyze ${video_urls.length} TikTok reference video(s) — extract EXACTLY what was said, how it was structured
2. Detect: hook, body, CTA, rhythm, tone, recurring claims, main promise, implicit objection, narrator style
3. Synthesize winning patterns across all videos
4. Generate ${numScripts} COMPLETE NARRATION SCRIPTS ready to paste into ElevenLabs

STYLE DIRECTION:
${styleInstruction}

LANGUAGE RULES (CRITICAL):
- ALL output MUST be in ${lang}
- Use authentic ${lang === "es-MX" ? "Mexican Spanish" : lang} vocabulary
- Sound like a real TikTok creator, not corporate copy
${productContext}
${priceContext}
${tiktokSafeBlock}

SCRIPT FORMAT RULES (VERY IMPORTANT):
- Each script MUST be a SINGLE CONTINUOUS TEXT BLOCK — ready to read aloud
- NO bullet points in the final script
- NO scene markers or stage directions
- NO JSON-looking structure in the script text
- NO "[pausa]", "[enfático]", or acting notes
- Just pure flowing narration text that can be pasted into ElevenLabs
- Hook + Body + CTA must flow naturally as ONE paragraph/text
- Each script should be different from the others

RESPOND IN VALID JSON:
{
  "insights": {
    "detected_hooks": ["..."],
    "detected_ctas": ["..."],
    "structure_pattern": "...",
    "tone": "...",
    "recurring_words": ["..."],
    "main_promise": "...",
    "implicit_objection": "...",
    "narrator_style": "...",
    "useful_patterns": ["..."]
  },
  "scripts": [
    {
      "title": "Short descriptive title",
      "style_tag": "testimonial|directo|emocional|oferta|problema_solucion|ugc|original",
      "full_script": "Complete flowing narration text ready to paste into ElevenLabs..."${tiktok_safe !== false ? `,
      "safe_version": "TikTok-safe version of the script...",
      "original_version": "Original pre-filter version...",
      "safety_changes": ["what was changed"]` : ""}
    }
  ]
}`;

    const userPrompt = `Analyze these TikTok reference videos and generate ${numScripts} complete narration scripts:

${videoList}

Extract what was said, detect winning patterns, and generate new scripts that follow similar structures but with fresh angles. Each script must be a single continuous text block ready to paste into ElevenLabs for voiceover.`;

    console.log("ScriptRoll generate:", { urls: video_urls.length, lang, numScripts, style, tiktok_safe });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded — intenta de nuevo en unos segundos" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados — agrega fondos en Settings → Workspace → Usage" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    console.log("ScriptRoll complete:", {
      insights: !!parsed.insights,
      scripts: parsed.scripts?.length,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-scriptroll error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Script generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
