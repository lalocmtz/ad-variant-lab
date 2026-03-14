

## Plan: Fix price extraction using Firecrawl for product page scraping

### Problem
TikTok Shop is a JavaScript SPA. The current `fetchProductPageText` uses a simple `fetch()` which gets an empty HTML shell — no prices, no product name. The AI then invents data. The real product is "$810.00" / "$2,899.00" but the AI returned "$299" / "$570.00".

### Solution
Use **Firecrawl** to scrape the product page. Firecrawl renders JavaScript and returns the actual page content including prices, product names, and descriptions.

### Steps

1. **Connect Firecrawl** — Set up the Firecrawl connector so the `FIRECRAWL_API_KEY` is available in edge functions.

2. **Update `analyze-bof-source/index.ts`**:
   - Replace `fetchProductPageText` (simple fetch) with a Firecrawl API call using `formats: ['markdown', 'json']`
   - Use Firecrawl's JSON extraction with a schema targeting: product name, current price, old price, description, rating, units sold
   - This gives the AI accurate, structured data instead of empty HTML
   - Keep the simple fetch as fallback if Firecrawl fails

3. **No UI changes needed** — The panel already sends the product URL correctly.

### Files to modify

| File | Change |
|---|---|
| `supabase/functions/analyze-bof-source/index.ts` | Replace `fetchProductPageText` with Firecrawl API call |

