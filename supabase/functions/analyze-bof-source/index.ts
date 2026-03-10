import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOF_FORMAT_IDS = [
  "01_LO_SIENTO_POR_LOS_QUE",
  "02_PROBLEM_SOLVER_DEMO",
  "03_SHOCK_VALUE_DISCOVERY",
  "04_PRICE_DROP",
  "05_FOMO_RESTOCK",
];

async function resolveUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow" });
    return resp.url || url;
  } catch {
    return url;
  }
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)" },
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    // Strip tags, keep text
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tiktok_url, product_url, product_image_url } = await req.json();

    if (!tiktok_url && !product_url) {
      return new Response(
        JSON.stringify({ error: "Se necesita al menos una URL (TikTok o producto)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Resolve and fetch content from URLs
    const sources: string[] = [];

    if (tiktok_url) {
      const resolved = await resolveUrl(tiktok_url);
      const text = await fetchPageText(resolved);
      if (text) {
        sources.push(`=== TIKTOK PAGE CONTENT ===\nURL: ${resolved}\n${text.slice(0, 3000)}`);
      } else {
        sources.push(`=== TIKTOK URL ===\n${resolved}\n(Could not fetch page content)`);
      }
    }

    if (product_url) {
      const resolved = await resolveUrl(product_url);
      const text = await fetchPageText(resolved);
      if (text) {
        sources.push(`=== PRODUCT PAGE CONTENT ===\nURL: ${resolved}\n${text.slice(0, 3000)}`);
      } else {
        sources.push(`=== PRODUCT URL ===\n${resolved}\n(Could not fetch page content)`);
      }
    }

    if (product_image_url) {
      sources.push(`=== PRODUCT IMAGE URL ===\n${product_image_url}`);
    }

    const systemPrompt = `You are a product data extraction specialist for TikTok Shop BOF (Bottom of Funnel) ads.

Your task: analyze the provided source content and extract structured product information for ad generation.

RULES:
- Extract only what you can confidently infer from the sources
- Set confidence 0.0-1.0 for each field (0 = could not determine, 1 = clearly stated)
- If a field cannot be determined, return empty string and confidence 0
- Prices should include currency symbol
- All text output must be in Spanish (Mexican Spanish)
- For suggested_formats, choose from ONLY these IDs: ${BOF_FORMAT_IDS.join(", ")}
- Suggest formats that best match the product type and selling angle
- Do NOT invent data that isn't supported by the sources

You MUST respond using the extract_product_data tool.`;

    const userPrompt = `Analyze these sources and extract product information for a TikTok Shop BOF ad:\n\n${sources.join("\n\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_product_data",
              description: "Return structured product data extracted from the sources.",
              parameters: {
                type: "object",
                properties: {
                  product_name: { type: "string", description: "Product name in Spanish" },
                  current_price: { type: "string", description: "Current price with currency" },
                  old_price: { type: "string", description: "Previous/original price if found" },
                  main_benefit: { type: "string", description: "Main product benefit in Spanish" },
                  offer: { type: "string", description: "Current offer or urgency angle in Spanish" },
                  pain_point: { type: "string", description: "Customer pain point in Spanish" },
                  audience: { type: "string", description: "Target audience description in Spanish" },
                  suggested_formats: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of format IDs from the BOF catalog",
                  },
                  language: { type: "string", description: "Language code, default es-MX" },
                  accent: { type: "string", description: "Accent, default mexicano" },
                  confidence: {
                    type: "object",
                    properties: {
                      product_name: { type: "number" },
                      current_price: { type: "number" },
                      old_price: { type: "number" },
                      main_benefit: { type: "number" },
                      offer: { type: "number" },
                      pain_point: { type: "number" },
                      audience: { type: "number" },
                    },
                    required: ["product_name", "current_price", "old_price", "main_benefit", "offer", "pain_point", "audience"],
                    additionalProperties: false,
                  },
                },
                required: ["product_name", "current_price", "old_price", "main_benefit", "offer", "pain_point", "audience", "suggested_formats", "language", "accent", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_product_data" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta de nuevo en un momento" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured data returned from AI");
    }

    let extracted: any;
    try {
      extracted = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse AI response");
    }

    // Validate suggested_formats against known IDs
    if (extracted.suggested_formats) {
      extracted.suggested_formats = extracted.suggested_formats.filter(
        (f: string) => BOF_FORMAT_IDS.includes(f)
      );
    }

    // Defaults
    if (!extracted.language) extracted.language = "es-MX";
    if (!extracted.accent) extracted.accent = "mexicano";

    console.log("BOF autofill extraction complete:", JSON.stringify(extracted));

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-bof-source error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error analizando fuentes" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
