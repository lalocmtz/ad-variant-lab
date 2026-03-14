import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function urlToBase64DataUri(url: string): Promise<string> {
  return fetch(url).then(async res => {
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const buffer = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const contentType = res.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { product_image_url, product_name, script_text, format_id, scene_plan, camera_rules, background_rules } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `PRODUCT REFERENCE: See the attached product image below.

TASK: Generate a hyper-realistic vertical (9:16) product ad image for TikTok Shop.

FORMAT: ${format_id}
PRODUCT: ${product_name}
SCRIPT CONTEXT: "${script_text}"

SCENE PLAN: ${(scene_plan || []).join(", ")}

CAMERA DIRECTIVES:
${(camera_rules || ["handheld", "phone aesthetic"]).map((r: string) => `- ${r}`).join("\n")}

BACKGROUND:
${(background_rules || ["casual home setting"]).map((r: string) => `- ${r}`).join("\n")}

CRITICAL REALISM DIRECTIVES:
1. CAMERA + LENS: Shot on iPhone 15 Pro Max in 4K. Must look like native smartphone footage, not DSLR or studio.
2. LIGHTING: Natural, imperfect. Window light, overhead indoor lighting, or phone flashlight. NO studio softboxes.
3. SKIN + TEXTURES: If hands visible, show real skin texture — pores, fine hair, natural color variation. Product must show real material texture — plastic sheen, label print quality, packaging wrinkles.
4. CANDID MOMENT: The image must feel like a real TikTok creator mid-recording. Spontaneous, not posed.
5. PHOTOGRAPHIC IMPERFECTIONS: Slight phone camera noise, realistic depth of field, minor lens distortion at edges.
6. ENVIRONMENT: Lived-in, authentic — real desk, real kitchen counter, real bathroom shelf. NOT a clean studio set.

PRODUCT RULES:
- The product MUST be a pixel-perfect copy of the reference image.
- Do NOT redesign packaging, colors, logo, label, shape, or typography.
- Product must be clearly visible, prominent, and the hero of the shot.

OUTPUT: 9:16 vertical, maximum resolution, hyper-realistic smartphone photography style.

NEGATIVE: No text overlays, no UI elements, no watermarks, no subtitles, no captions, no comment bubbles, no social media UI, no studio lighting, no CGI look, no stock photo appearance, no AI-generated smoothness, no product redesign.`;

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: prompt },
    ];

    if (product_image_url) {
      try {
        const dataUri = await urlToBase64DataUri(product_image_url);
        content.push({ type: "image_url", image_url: { url: dataUri } });
      } catch (e) {
        console.warn("Failed to convert product image to base64, using URL:", e);
        content.push({ type: "image_url", image_url: { url: product_image_url } });
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("BOF image generation error:", response.status, errText);
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("BOF image response keys:", JSON.stringify({
      hasChoices: !!data.choices,
      choiceCount: data.choices?.length,
      messageKeys: data.choices?.[0]?.message ? Object.keys(data.choices[0].message) : [],
      hasImages: !!data.choices?.[0]?.message?.images,
      imageCount: data.choices?.[0]?.message?.images?.length,
      contentPreview: typeof data.choices?.[0]?.message?.content === "string" 
        ? data.choices[0].message.content.substring(0, 200) 
        : "non-string",
    }));

    // Try multiple extraction paths
    let imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
    
    // Fallback: check if image is inline in content as base64
    if (!imageUrl) {
      const msgContent = data.choices?.[0]?.message?.content;
      if (typeof msgContent === "string" && msgContent.includes("data:image")) {
        const match = msgContent.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
        if (match) imageUrl = match[1];
      }
      // Check if content is array with image parts
      if (Array.isArray(msgContent)) {
        for (const part of msgContent) {
          if (part?.type === "image_url" && part?.image_url?.url) {
            imageUrl = part.image_url.url;
            break;
          }
        }
      }
    }

    if (!imageUrl) {
      console.error("No image in response. Full response:", JSON.stringify(data).substring(0, 2000));
      throw new Error("No image generated");
    }

    return new Response(JSON.stringify({ image_url: imageUrl, visual_prompt: prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-bof-images error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error generando imagen BOF" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
