import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/* ─── TikTok metadata via RapidAPI ─── */
interface TikTokMeta {
  url: string;
  title: string;
  description: string;
  author: string;
  music: string;
  hashtags: string[];
  duration: number;
  cover_url: string; // origin_cover or cover from the video
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
      return { url, title: "", description: "", author: "", music: "", hashtags: [], duration: 0, cover_url: "" };
    }
    const data = await resp.json();
    const d = data?.data || data || {};
    const title = d.title || d.desc || "";
    const hashtagMatches = title.match(/#[\w\u00C0-\u024F]+/g) || [];
    
    // Extract cover image URL
    const coverUrl = d.origin_cover || d.cover || d.dynamic_cover || "";
    console.log("TikTok cover URL found:", coverUrl ? "yes" : "no");

    return {
      url,
      title,
      description: d.desc || d.title || "",
      author: d.author?.nickname || d.author?.unique_id || "",
      music: d.music_info?.title || d.music || "",
      hashtags: hashtagMatches.map((h: string) => h.replace("#", "")),
      duration: d.duration || 0,
      cover_url: coverUrl,
    };
  } catch (e) {
    console.error("Failed to fetch TikTok metadata for", url, e);
    return { url, title: "", description: "", author: "", music: "", hashtags: [], duration: 0, cover_url: "" };
  }
}

/* ─── Product data via Firecrawl SEARCH (scrape blocked for TikTok Shop) ─── */
async function searchProductData(productUrl: string, firecrawlKey: string): Promise<string> {
  try {
    // Extract product ID or name from URL for better search
    const productIdMatch = productUrl.match(/product\/(\d+)/);
    const productId = productIdMatch?.[1] || "";
    
    // Build search query from the URL
    const searchQuery = productId
      ? `TikTok Shop producto ${productId} precio`
      : `site:shop.tiktok.com ${productUrl.split("/").pop() || "producto"} precio`;

    console.log("Firecrawl SEARCH query:", searchQuery);

    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        lang: "es",
        country: "MX",
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Firecrawl search error:", resp.status, errText);
      return "";
    }

    const data = await resp.json();
    const results = data?.data || [];
    
    if (results.length === 0) {
      console.log("Firecrawl search returned no results");
      return "";
    }

    const parts: string[] = [];
    for (const result of results.slice(0, 3)) {
      const chunk = [
        `Title: ${result.title || ""}`,
        `URL: ${result.url || ""}`,
        `Description: ${result.description || ""}`,
        result.markdown ? `Content:\n${result.markdown.slice(0, 3000)}` : "",
      ].filter(Boolean).join("\n");
      parts.push(chunk);
    }

    const combined = parts.join("\n\n---\n\n");
    console.log("Firecrawl search returned", results.length, "results");
    return `=== PRODUCT SEARCH RESULTS ===\n${combined}`;
  } catch (e) {
    console.error("Firecrawl search failed:", e);
    return "";
  }
}

/* ─── Fallback: simple fetch for product page ─── */
async function fetchProductPageFallback(url: string): Promise<string> {
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
    const plainText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    return "=== PAGE TEXT (fallback) ===\n" + plainText;
  } catch {
    return "";
  }
}

/* ─── Upload cover image to storage ─── */
async function uploadCoverToStorage(coverUrl: string): Promise<string> {
  try {
    console.log("Downloading cover image from:", coverUrl.slice(0, 80));
    const resp = await fetch(coverUrl);
    if (!resp.ok) {
      console.error("Failed to download cover:", resp.status);
      return "";
    }
    
    const blob = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpeg";
    const fileName = `bof_cover_${Date.now()}.${ext}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase.storage
      .from("videos")
      .upload(fileName, new Uint8Array(blob), { contentType });

    if (error) {
      console.error("Storage upload error:", error.message);
      return "";
    }

    const { data } = supabase.storage.from("videos").getPublicUrl(fileName);
    console.log("Cover uploaded to storage:", data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    console.error("Cover upload failed:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
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
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ─── Gather all sources in parallel ───
    const metadataPromises = RAPIDAPI_KEY
      ? tiktokUrls.map((url) => fetchTikTokMetadata(url, RAPIDAPI_KEY))
      : [];

    // Use Firecrawl SEARCH instead of scrape (TikTok Shop blocks scraping)
    let productPromise: Promise<string>;
    if (productUrl && FIRECRAWL_API_KEY) {
      productPromise = searchProductData(productUrl, FIRECRAWL_API_KEY).then(
        (text) => text || fetchProductPageFallback(productUrl)
      );
    } else if (productUrl) {
      productPromise = fetchProductPageFallback(productUrl);
    } else {
      productPromise = Promise.resolve("");
    }

    const [videoMetadata, productText] = await Promise.all([
      Promise.all(metadataPromises),
      productPromise,
    ]);

    // ─── Extract & upload cover image ───
    let resolvedProductImageUrl = productImageUrl;
    if (!resolvedProductImageUrl) {
      // Find first available cover from video metadata
      const coverUrl = videoMetadata.find((v) => v.cover_url)?.cover_url || "";
      if (coverUrl) {
        resolvedProductImageUrl = await uploadCoverToStorage(coverUrl);
      }
    }

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
      tiktokUrls.forEach((url, i) => {
        sources.push(`=== TIKTOK VIDEO ${i + 1} ===\nURL: ${url}\n(RapidAPI key not configured — limited extraction)`);
      });
    }

    if (productText) {
      sources.push(`=== PRODUCT PAGE ===\nURL: ${productUrl}\n${productText}`);
    } else if (productUrl) {
      sources.push(`=== PRODUCT URL ===\n${productUrl}\n(Could not fetch page content)`);
    }

    if (resolvedProductImageUrl) {
      sources.push(`=== PRODUCT IMAGE URL ===\n${resolvedProductImageUrl}`);
    }

    const systemPrompt = `You are a product data extraction specialist for TikTok Shop BOF (Bottom of Funnel) ads.

You receive metadata from WINNING TikTok videos promoting a product, plus optionally product page search results or the product URL. Your task: cross-reference ALL sources to extract accurate PRODUCT information.

CRITICAL RULES:
- Extract PRODUCT information (name, price, benefits), NOT video metadata
- Cross-reference multiple video titles/descriptions to identify the real product name, benefits, and selling angles
- From video titles, extract: hooks used, pain points addressed, offers mentioned, urgency angles
- From search results (if available): extract exact prices, product name, features. These are the MOST RELIABLE source for prices.
- Set confidence 0.0-1.0 for each field (0 = could not determine, 1 = clearly stated in sources)
- If a field cannot be determined, return empty string and confidence 0
- Prices should include currency symbol (usually MXN $ for TikTok Shop Mexico). Be very careful with prices — only use prices explicitly found in the sources, NEVER invent prices.
- All text output MUST be in Spanish (Mexican Spanish)
- For suggested_formats, choose from ONLY these IDs: ${BOF_FORMAT_IDS.join(", ")}
- Suggest formats that best match the product type and the selling angles found in the winning videos
- Do NOT invent data that isn't supported by the sources
- The "offer" field should capture urgency/discount angles found in the videos
- The "pain_point" field should capture customer problems mentioned in the video hooks
- The "main_benefit" field should be a compelling, specific benefit extracted from the video descriptions

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
                  current_price: { type: "string", description: "Current price with currency symbol. ONLY from sources, never invented." },
                  old_price: { type: "string", description: "Previous/original price if found in sources" },
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

    // Add product_image_url to response
    if (resolvedProductImageUrl) {
      extracted.product_image_url = resolvedProductImageUrl;
    }

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
