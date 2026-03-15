import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, cover_url, metadata, variant_count, language, accent, tone, tiktok_compliance, additional_image_urls } = await req.json();
    if (!cover_url) throw new Error("cover_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const numVariants = variant_count || 3;
    const lang = language || "es-MX";
    const voiceAccent = accent || "mexicano";
    const voiceTone = tone || "natural_ugc";
    const videoDuration = metadata?.duration || 15;

    const complianceBlock = tiktok_compliance ? `

FILTRO ANTI-BAN TIKTOK SHOP (OBLIGATORIO — CUMPLIR AL 100%):
- NO promesas médicas, curas ni garantías de resultados absolutos
- NO comparativas de "antes y después" con resultados garantizados
- NO claims de salud regulados (FDA, COFEPRIS, etc.)
- NO lenguaje de "garantía", "100% efectivo", "cura", "elimina", "milagroso"
- NO testimonios que impliquen resultados médicos
- SÍ experiencia personal: "a mí me funcionó", "noté cambios", "me encantó"
- SÍ prueba social: "miles de personas lo usan", "se está agotando"
- SÍ urgencia comercial: escasez, descuentos, tiempo limitado
- SÍ beneficios demostrables sin claims médicos
- Usa disclaimers implícitos: "resultados pueden variar"
- Cada frase del script DEBE pasar revisión de políticas de TikTok Shop sin riesgo de ban` : "";

    const systemPrompt = `You are a TikTok Shop voice-over script writer for product B-roll ads.

Your task: Generate ${numVariants} DIFFERENT voice-over script variants for the SAME product video.

RULES:
- The visual video stays the SAME for all variants. Only the voice-over script changes.
- Each variant must have a DIFFERENT hook angle, wording, and CTA phrasing.
- Same product, same offer, same core claim — different persuasion angles.
- Scripts must be in ${lang === "es-MX" ? "español mexicano" : lang}.
- Duration target: ${videoDuration} seconds max per script.
- Tone: ${voiceTone === "natural_ugc" ? "natural UGC creator recommendation — casual, conversational, authentic" : voiceTone}.
- Accent: ${voiceAccent}.
- Write as a real Mexican creator would speak naturally in a TikTok ad.
- Avoid Spain Spanish, corporate tone, robotic narration.
- NO subtitles or text overlays — these are voice-only scripts.
- Short, direct, organic phrasing.
- Each script should be self-contained and complete.
${complianceBlock}
HOOK ANGLE IDEAS (use different ones per variant):
- Price/deal angle ("No vas a creer el precio...")
- Problem/solution ("Si tienes este problema...")
- Social proof ("Todo mundo está comprando esto...")
- Curiosity ("Encontré algo que necesitas ver...")
- FOMO ("Se está agotando...")
- Before/after ("Mira la diferencia...")
- Personal testimony ("Llevo usándolo 2 semanas y...")

VIDEO CONTEXT: Analyze the cover frame to understand the product and scene.
Video duration: ${videoDuration}s
Metadata: ${JSON.stringify(metadata || {})}`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `Generate ${numVariants} voice-over script variants for this product B-roll video. Each variant must use a completely different hook angle and wording strategy. The visual video remains the same — only the spoken voice-over changes.`,
      },
      { type: "image_url", image_url: { url: cover_url } },
    ];
    if (Array.isArray(additional_image_urls)) {
      for (const imgUrl of additional_image_urls.slice(0, 3)) {
        userContent.push({ type: "text", text: "Additional product reference image for context:" });
        userContent.push({ type: "image_url", image_url: { url: imgUrl } });
      }
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "broll_scripts",
              description: "Return voice-over script variants for the product B-roll video",
              parameters: {
                type: "object",
                properties: {
                  product_detected: { type: "string", description: "Brief description of the product detected in the video" },
                  scene_analysis: {
                    type: "object",
                    properties: {
                      shot_types: { type: "array", items: { type: "string" }, description: "Types of shots detected (close-up, demo, environment, etc.)" },
                      product_handling: { type: "boolean", description: "Whether the video shows hands handling the product" },
                      environment: { type: "string", description: "The setting/environment of the video" },
                      pacing: { type: "string", description: "Fast, medium, or slow pacing" },
                    },
                    required: ["shot_types", "product_handling", "environment", "pacing"],
                  },
                  variants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_id: { type: "string" },
                        hook_angle: { type: "string", description: "The persuasion angle used (price, problem, curiosity, etc.)" },
                        script_text: { type: "string", description: "The complete voice-over script" },
                        hook: { type: "string", description: "The hook opening line" },
                        body: { type: "string", description: "The body/middle of the script" },
                        cta: { type: "string", description: "The call-to-action closing" },
                        estimated_duration_seconds: { type: "number" },
                        delivery_notes: { type: "string", description: "How this should be spoken (energy, pace, emotion)" },
                      },
                      required: ["variant_id", "hook_angle", "script_text", "hook", "body", "cta", "estimated_duration_seconds", "delivery_notes"],
                    },
                  },
                },
                required: ["product_detected", "scene_analysis", "variants"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "broll_scripts" } },
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
    console.log("Broll scripts generated:", { product: result.product_detected, variants: result.variants?.length });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-broll-scripts error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Script generation failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
