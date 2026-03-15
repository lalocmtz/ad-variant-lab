import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { product_name, product_image_url, current_price, old_price, main_benefit, offer, pain_point, audience, selected_formats, language, accent, tiktok_compliance, additional_image_urls } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langLabel = language === "es-MX" ? "español mexicano" : language;
    const accentLabel = accent || "mexicano";

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

    const systemPrompt = `Eres un experto en scripts para TikTok Shop BOF (bottom-of-funnel) ads.
Tu trabajo es generar scripts cortos (7-12 segundos hablados) para anuncios verticales de producto.

REGLAS OBLIGATORIAS:
- El script DEBE estar escrito en ${langLabel}.
- El acento y tono deben ser de un creador ${accentLabel} real, natural, orgánico.
- NO uses tono corporativo, formal ni de marketing tradicional.
- NO uses frases de España (ejemplo: "mola", "tío", "vale").
- Escribe como habla un creador mexicano de TikTok: casual, directo, auténtico.
- El script es SOLO para voz hablada. NO incluyas indicaciones de subtítulos, overlays, texto en pantalla ni elementos gráficos.
- Cada script debe ser pronunciable en 7-12 segundos máximo.
- NO inventes formatos nuevos. Adapta el script al formato proporcionado.
${complianceBlock}
Responde SIEMPRE en JSON válido.`;

    const formatDescriptions = selected_formats.map((fid: string) => {
      const descriptions: Record<string, string> = {
        "01_LO_SIENTO_POR_LOS_QUE": "Format: 'Lo siento por los que…' — Reverse exclusion + curiosity. Opens with empathy/teasing, reveals product, urgency CTA.",
        "02_PROBLEM_SOLVER_DEMO": "Format: 'Problem Solver Demo' — Names a pain point, shows product solving it, genuine reaction, purchase CTA.",
        "03_SHOCK_VALUE_DISCOVERY": "Format: 'Shock Value Discovery' — Bold unexpected claim, product as secret answer, quick proof, scarcity CTA.",
        "04_PRICE_DROP": "Format: 'Price Drop' — Anchors with old price, reveals deal with excitement, brief feature highlight, time-limited CTA.",
        "05_FOMO_RESTOCK": "Format: 'FOMO / Restock' — Emphasizes scarcity/restock, social proof, quick product highlight, urgency CTA.",
      };
      return descriptions[fid] || `Format: ${fid}`;
    }).join("\n");

    const userPrompt = `Genera un script de TikTok Shop BOF ad para cada formato indicado.

PRODUCTO:
- Nombre: ${product_name}
- Precio actual: ${current_price}
- Precio anterior: ${old_price || "N/A"}
- Beneficio principal: ${main_benefit}
- Oferta/urgencia: ${offer || "N/A"}
- Pain point: ${pain_point || "N/A"}
- Audiencia: ${audience || "general"}

FORMATOS A GENERAR:
${formatDescriptions}

Responde en este formato JSON exacto:
{
  "scripts": [
    {
      "format_id": "ID_DEL_FORMATO",
      "script_text": "El script completo listo para ser hablado por el creador",
      "hook_line": "La primera frase gancho",
      "cta_line": "La frase de cierre/CTA",
      "estimated_seconds": 8
    }
  ]
}`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Script generation error:", response.status, errText);
      throw new Error(`Script generation failed: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();

    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-bof-scripts error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error generando scripts" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
