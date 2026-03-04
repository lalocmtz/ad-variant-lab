import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      brand_name, brand_description, brand_intelligence,
      template_image_url, product_image_url,
      profile, cta, aspect_ratio,
      packaging_lock, style_intensity, negative_prompt,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build user content with images — only include valid URLs
    const userContent: any[] = [
      { type: "text", text: `Brand: ${brand_name}\nProduct: ${brand_description || "See reference image"}\nTarget: ${profile.name} (${profile.age_range}) — Pain points: ${profile.pain_points}. Desires: ${profile.desires}.\nMessaging angle: ${profile.messaging_angle}\nCTA: ${cta || "Shop Now"}\nPackaging lock: ${packaging_lock ? "ON — preserve product packaging exactly" : "OFF"}\nStyle intensity: ${style_intensity ?? 30}/100\n\nBrand intelligence: ${brand_intelligence || "N/A"}\n\nGenerate a detailed image prompt for this ad. The prompt should recreate the style of the reference template image${product_image_url ? " with the product shown in the product image" : ""}.${negative_prompt ? `\n\nNegative prompt (avoid these): ${negative_prompt}` : ""}` },
      { type: "image_url", image_url: { url: template_image_url } },
    ];

    if (product_image_url) {
      userContent.push({ type: "image_url", image_url: { url: product_image_url } });
    }

    // Step 1: Generate ad prompt using Gemini
    const promptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert Meta ads designer. You will receive a reference ad template image${product_image_url ? " and a product image" : ""}. Your job is to write a detailed image generation prompt that recreates the style, layout, and feel of the reference template${product_image_url ? " but uses the provided product" : " for a similar product"}. The output image should look like a professional static ad for Meta (Facebook/Instagram).

Rules:
- Match the template's visual style exactly (colors, layout, typography style, composition)
- Feature the product prominently
- Include any CTA text naturally integrated into the design
- Target the specific customer profile provided
- Output aspect ratio: ${aspect_ratio}
- Make it look like a real, professional Meta ad — not AI-generated art
- Include specific details about text placement, colors, and composition
${negative_prompt ? `- AVOID: ${negative_prompt}` : ""}`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });

    if (!promptResponse.ok) {
      const t = await promptResponse.text();
      console.error("Prompt gen error:", promptResponse.status, t);
      throw new Error(`Prompt generation failed: ${promptResponse.status}`);
    }

    const promptData = await promptResponse.json();
    const adPrompt = promptData.choices?.[0]?.message?.content;
    if (!adPrompt) throw new Error("No prompt generated");

    // Step 2: Generate image using gemini-2.5-flash-image
    const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: adPrompt,
          },
        ],
      }),
    });

    if (!imageResponse.ok) {
      const t = await imageResponse.text();
      console.error("Image gen error:", imageResponse.status, t);

      if (imageResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later", prompt: adPrompt }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (imageResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds", prompt: adPrompt }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Image generation failed: ${imageResponse.status}`);
    }

    const imageData = await imageResponse.json();
    
    const content = imageData.choices?.[0]?.message?.content;
    let imageUrl = null;

    const parts = imageData.choices?.[0]?.message?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inline_data) {
          imageUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
          break;
        }
      }
    }

    if (!imageUrl && content) {
      const urlMatch = content.match(/https?:\/\/[^\s)]+\.(png|jpg|jpeg|webp)/i);
      if (urlMatch) imageUrl = urlMatch[0];
      
      const b64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (b64Match) imageUrl = b64Match[0];
    }

    return new Response(JSON.stringify({ 
      image_url: imageUrl,
      prompt: adPrompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-static-ad error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
