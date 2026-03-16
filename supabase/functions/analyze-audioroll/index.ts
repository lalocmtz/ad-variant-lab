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
      target_duration_seconds,
      tiktok_safe,
    } = await req.json();

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0)
      throw new Error("Se requiere al menos 1 URL de video");
    if (video_urls.length > 5) throw new Error("Máximo 5 URLs");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const numScripts = Math.min(Math.max(script_count || 5, 1), 10);
    const duration = target_duration_seconds || 15;

    const videoList = video_urls.map((u: string, i: number) => `Video ${i + 1}: ${u}`).join("\n");

    const tiktokSafeBlock = tiktok_safe ? `
TIKTOK SHOP COMPLIANCE (CRITICAL — ANTI-BAN FILTER):
After generating each script, apply a TikTok-safe rewrite:
- REMOVE all medical claims, cure promises, guaranteed results, before-and-after comparisons
- REPLACE absolute claims with personal experience language ("a mí me funcionó", "yo noté cambios")
- KEEP persuasive power — just shift from medical claims to social proof and urgency
- For each script that was modified, include a "safety_changes" array listing what was changed
- Output both "full_script" (safe version) and "original_version" (pre-filter version)
- The "safe_version" field should contain the TikTok-safe rewrite
` : "";

    const systemPrompt = `You are an elite TikTok Shop Script Miner and Narration Script Generator.

Your job:
1. Analyze ${video_urls.length} TikTok reference video(s) — extract what was SAID, how it was structured, what hooks/CTAs were used
2. Synthesize a cross-video winning pattern report
3. Generate ${numScripts} READY-TO-NARRATE scripts based on the winning patterns
4. Each script must be optimized for a ~${duration}s voiceover narration

LANGUAGE RULES (CRITICAL):
- ALL scripts MUST be in ${lang}
- Use authentic ${lang === "es-MX" ? "Mexican Spanish" : lang} vocabulary
- No neutral corporate Spanish — sound like a real TikTok creator
${tiktokSafeBlock}

SCRIPT REQUIREMENTS:
- Each script must include: title, angle, hook, body, cta, full_script (complete narration text), estimated_duration_seconds, delivery_style
- full_script must be the COMPLETE text to be read aloud — not a summary
- Delivery styles: energetic, testimonial, casual, urgent, educational, storytelling
- Scripts should vary in angle: pattern-winner, testimonial, problem-solution, offer-first, emotional, direct
- Hook must grab attention in 2-3 seconds
- CTA must be clear and TikTok Shop native (carrito naranja, link, comenta, etc.)

${product_image_url ? `Product image provided for context: ${product_image_url}` : ""}
${notes ? `Additional context: ${notes}` : ""}

RESPOND IN VALID JSON with this exact structure:
{
  "reference_analyses": [
    {
      "video_url": "...",
      "hook_text": "...",
      "narrative_structure": "...",
      "tone": "...",
      "cta_text": "...",
      "claims": ["..."],
      "winning_elements": ["..."]
    }
  ],
  "winning_patterns": {
    "hook_patterns": ["..."],
    "script_patterns": ["..."],
    "cta_patterns": ["..."],
    "structure_summary": "...",
    "recommended_duration_seconds": ${duration}
  },
  "scripts": [
    {
      "title": "...",
      "angle": "...",
      "hook": "...",
      "body": "...",
      "cta": "...",
      "full_script": "...",
      "estimated_duration_seconds": ...,
      "delivery_style": "..."${tiktok_safe ? `,
      "safe_version": "...",
      "original_version": "...",
      "safety_changes": ["..."]` : ""}
    }
  ]
}`;

    const userPrompt = `Analyze these TikTok reference videos and generate ${numScripts} narration scripts (~${duration}s each):

${videoList}

Extract what was said, the winning narrative pattern, and create new scripts that follow the same structure but with fresh angles.`;

    console.log("AudioRoll analyze:", { urls: video_urls.length, lang, numScripts, duration, tiktok_safe });

    const response = await fetch("https://ai.lovable.dev/chat/v1", {
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

    console.log("AudioRoll analysis complete:", {
      analyses: parsed.reference_analyses?.length,
      scripts: parsed.scripts?.length,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-audioroll error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
