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

/* ─── TikTok metadata via RapidAPI (same endpoint as download-tiktok) ─── */
interface TikTokMeta {
  url: string;
  title: string;
  description: string;
  author: string;
  music: string;
  hashtags: string[];
  duration: number;
}

async function fetchTikTokMetadata(url: string, rapidApiKey: string): Promise<TikTokMeta> {
  try {
    const apiUrl = `https://tiktok-download-video1.p.rapidapi.com/getVideo?url=${encodeURIComponent(url)}&hd=1`;
    const resp = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "tiktok-download-video1.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
      },
    });
    if (!resp.ok) {
      console.error("RapidAPI error for", url, resp.status);
      return { url, title: "", description: "", author: "", music: "", hashtags: [], duration: 0 };
    }
    const data = await resp.json();
    const d = data?.data || data || {};
    const title = d.title || d.desc || "";
    // Extract hashtags from title
    const hashtagMatches = title.match(/#[\w\u00C0-\u024F]+/g) || [];
    return {
      url,
      title,
      description: d.desc || d.title || "",
      author: d.author?.nickname || d.author?.unique_id || "",
      music: d.music_info?.title || d.music || "",
      hashtags: hashtagMatches.map((h: string) => h.replace("#", "")),
      duration: d.duration || 0,
    };
  } catch (e) {
    console.error("Failed to fetch TikTok metadata for", url, e);
    return { url, title: "", description: "", author: "", music: "", hashtags: [], duration: 0 };
  }
}

/* ─── Product page scraping with better headers ─── */
async function fetchProductPageText(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.5",
      },
    });
    if (!resp.ok) return "";
    const html = await resp.text();

    // Try to extract JSON-LD structured data first (most reliable)
    const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    let structuredData = "";
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        const json = match.replace(/<\/?script[^>]*>/gi, "").trim();
        structuredData += json + "\n";
      }
    }

    // Also extract meta tags
    const metaTags: string[] = [];
    const metaRegex = /<meta[^>]*(?:name|property|content)=[^>]*>/gi;
    let m;
    while ((m = metaRegex.exec(html)) !== null) {
      const tag = m[0];
      if (
        tag.includes("og:") ||
        tag.includes("product") ||
        tag.includes("price") ||
        tag.includes("description") ||
        tag.includes("title")
      ) {
        metaTags.push(tag);
      }
    }

    // Fallback: strip HTML to plain text
    const plainText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    const parts: string[] = [];
    if (structuredData) parts.push("=== JSON-LD DATA ===\n" + structuredData.slice(0, 3000));
    if (metaTags.length) parts.push("=== META TAGS ===\n" + metaTags.join("\n").slice(0, 1000));
    parts.push("=== PAGE TEXT ===\n" + plainText);

    return parts.join("\n\n");
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Support both old single URL and new array format
    const tiktokUrls: string[] = body.tiktok_urls || (body.tiktok_url ? [body.tiktok_url] : []);
    const productUrl: string = body.product_url || "";
    const productImageUrl: string = body.product_image_url || "";

    if (tiktokUrls.length === 0 && !productUrl) {
      return new Response(
        JSON.stringify({ error: "Se necesita al menos una URL (TikTok o producto)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ─── Gather all sources in parallel ───
    const metadataPromises = RAPIDAPI_KEY
      ? tiktokUrls.map((url) => fetchTikTokMetadata(url, RAPIDAPI_KEY))
      : [];
    const productPromise = productUrl ? fetchProductPageText(productUrl) : Promise.resolve("");

    const [videoMetadata, productText] = await Promise.all([
      Promise.all(metadataPromises),
      productPromise,
    ]);

    // ─── Build source context for AI ───
    const sources: string[] = [];

    if (videoMetadata.length > 0) {
      for (let i = 0; i < videoMetadata.length; i++) {
        const v = videoMetadata[i];
        if (v.title || v.description) {
          sources.push(
            `=== WINNING TIKTOK VIDEO ${i + 1} ===\n` +
            `URL: ${v.url}\n` +
            `Title/Description: ${v.title}\n` +
            `Author: ${v.author}\n` +
            `Music: ${v.music}\n` +
            `Hashtags: ${v.hashtags.join(", ")}\n` +
            `Duration: ${v.duration}s`
          );
        } else {
          sources.push(`=== TIKTOK VIDEO ${i + 1} ===\nURL: ${v.url}\n(No metadata extracted)`);
        }
      }
    } else if (tiktokUrls.length > 0 && !RAPIDAPI_KEY) {
      // Fallback: just include URLs without metadata
      tiktokUrls.forEach((url, i) => {
        sources.push(`=== TIKTOK VIDEO ${i + 1} ===\nURL: ${url}\n(RapidAPI key not configured — limited extraction)`);
      });
    }

    if (productText) {
      sources.push(`=== PRODUCT PAGE ===\nURL: ${productUrl}\n${productText}`);
    } else if (productUrl) {
      sources.push(`=== PRODUCT URL ===\n${productUrl}\n(Could not fetch page content)`);
    }

    if (productImageUrl) {
      sources.push(`=== PRODUCT IMAGE URL ===\n${productImageUrl}`);
    }

    const systemPrompt = `You are a product data extraction specialist for TikTok Shop BOF (Bottom of Funnel) ads.

You receive metadata from WINNING TikTok videos promoting a product, plus optionally the product page data. Your task: cross-reference ALL sources to extract accurate PRODUCT information.

CRITICAL RULES:
- Extract PRODUCT information (name, price, benefits), NOT video metadata
- Cross-reference multiple video titles/descriptions to identify the real product name, benefits, and selling angles
- From video titles, extract: hooks used, pain points addressed, offers mentioned, urgency angles
- From the product page (if available): extract exact prices, product name, features
- Set confidence 0.0-1.0 for each field (0 = could not determine, 1 = clearly stated in sources)
- If a field cannot be determined, return empty string and confidence 0
- Prices should include currency symbol (usually MXN $ for TikTok Shop Mexico)
- All text output MUST be in Spanish (Mexican Spanish)
- For suggested_formats, choose from ONLY these IDs: ${BOF_FORMAT_IDS.join(", ")}
- Suggest formats that best match the product type and the selling angles found in the winning videos
- Do NOT invent data that isn't supported by the sources
- The "offer" field should capture urgency/discount angles found in the videos
- The "pain_point" field should capture customer problems mentioned in the video hooks

You MUST respond using the extract_product_data tool.`;

    const userPrompt = `Analyze these ${sources.length} sources and extract product information for a TikTok Shop BOF ad:\n\n${sources.join("\n\n")}`;

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
                  offer: { type: "string", description: "Current offer or urgency angle found in winning videos, in Spanish" },
                  pain_point: { type: "string", description: "Customer pain point from video hooks, in Spanish" },
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

    // Validate suggested_formats
    if (extracted.suggested_formats) {
      extracted.suggested_formats = extracted.suggested_formats.filter(
        (f: string) => BOF_FORMAT_IDS.includes(f)
      );
    }

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
