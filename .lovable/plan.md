

## Plan: Fix BOF Autofill — Multiple Video URLs + Better Extraction

### Problem
The current `analyze-bof-source` edge function tries to scrape TikTok and TikTok Shop pages via `fetchPageText`, but both are SPAs that return almost no useful text content. The AI then invents data instead of extracting it.

Meanwhile, the `download-tiktok` function already uses RapidAPI which returns real metadata (title, description, author, duration). We should leverage that same API for extraction.

### Changes

#### 1. UI: Multiple TikTok Video URLs + Single Product URL
**File: `src/components/bof/BofAutofillPanel.tsx`**
- Replace single `tiktokUrl` string with `tiktokUrls: string[]` starting with one field
- "Agregar otro video" button adds a new URL field (up to 5 max)
- Remove button per extra field
- Product URL stays as single field
- Send array `tiktok_urls` to the edge function

#### 2. Edge Function: Use RapidAPI for TikTok metadata
**File: `supabase/functions/analyze-bof-source/index.ts`**
- Accept `tiktok_urls: string[]` (array) instead of `tiktok_url: string`
- For each TikTok URL, call the same RapidAPI endpoint used by `download-tiktok` to get real metadata (title, description, author, music, hashtags, duration)
- Do NOT download/upload the video — just extract metadata
- For the product URL, use a more robust fetch with proper headers (mobile user agent) and increase content limit
- Concatenate all video metadata + product page text as sources for the AI
- The AI prompt instructs it to cross-reference multiple videos to find the real product info, selling angles, hooks used, and pain points

#### 3. Updated AI Prompt
- Instruct the AI: "You have metadata from N winning TikTok videos promoting this product. Extract the PRODUCT information, not video metadata. Cross-reference all sources to find the most accurate product name, price, benefits, and selling angles."
- Add instruction to extract hooks/angles from video titles/descriptions for the `pain_point` and `offer` fields

### Files to modify

| File | Change |
|---|---|
| `src/components/bof/BofAutofillPanel.tsx` | Dynamic array of TikTok URLs, "Agregar video" button |
| `supabase/functions/analyze-bof-source/index.ts` | Use RapidAPI for TikTok metadata, accept array, better product page fetch |

