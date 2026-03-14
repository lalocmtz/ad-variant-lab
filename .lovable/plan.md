

## Plan: Fix BOF Autofill — Firecrawl blocked, use web search + cover image extraction

### Root Cause
From the edge function logs:
```
Firecrawl error: 403 — "We do not support this site"
```
**Firecrawl does not support TikTok Shop.** The fallback `fetch()` gets an empty SPA shell. So the AI receives zero price data and returns `current_price: ""` or invents prices.

### Solution: Three changes

#### 1. Replace Firecrawl scrape with Firecrawl **search** for product data
Since we can't scrape TikTok Shop directly, use Firecrawl's **search** endpoint to find the product info on the web. Search for the product name + "TikTok Shop" + "precio" to find cached/indexed product listings with real prices.

Also extract the product ID from the TikTok Shop URL and use it in the search query for precision.

#### 2. Extract product cover image from RapidAPI video metadata
RapidAPI already returns `origin_cover` and `cover` fields (JPEG URLs of the video thumbnail). The edge function will return the first available cover URL. The frontend will download it and set it as the product image automatically — no manual upload needed.

#### 3. Return `product_image_url` from edge function + auto-set in frontend
Add `product_image_url` to the edge function response (from video cover). In `BofAutofillPanel`, fetch that URL as a blob, convert to File, and pass it via `onAutofillComplete` so the form auto-populates the product image.

### Files to modify

| File | Change |
|---|---|
| `supabase/functions/analyze-bof-source/index.ts` | Replace Firecrawl scrape with Firecrawl search for product pages. Extract `origin_cover` from RapidAPI metadata and return as `product_image_url`. Upload cover to storage. |
| `src/components/bof/BofAutofillPanel.tsx` | When response includes `product_image_url`, fetch it as blob, create File, pass to `onAutofillComplete` |
| `src/lib/bof_types.ts` | Add `product_image_url?: string` to `BofAutofillResult` |

### Edge function flow (updated)
```text
TikTok URLs ──► RapidAPI ──► metadata (title, desc, hashtags, cover_url)
                                │
Product URL ──► extract product ID ──► Firecrawl SEARCH ──► prices, name
                                │
Cover URL ──► download + upload to storage ──► product_image_url
                                │
All sources ──► AI (Gemini) ──► structured extraction ──► response
```

