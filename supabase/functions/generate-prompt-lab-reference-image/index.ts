import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      job_id,
      source_video_url,
      product_image_url,
      hook_frame_description,
      actor_description,
      style_description,
      variation_policy,
      target_platform,
      language,
      realism_level,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const platform = target_platform || "generic";
    const lang = language || "es-MX";
    const realism = realism_level || "maximum";

    const prompt = `Generate a HYPER-REALISTIC reference image for AI video animation.

PURPOSE: This image will be used as the FIRST FRAME / VISUAL ANCHOR when animating a viral video recreation in ${platform === "sora" ? "Sora" : platform === "higgsfield" ? "Higgsfield" : "an AI video generator"}.

=== HOOK FRAME COMPOSITION (replicate this exactly) ===
${hook_frame_description || "A creator holding a product, looking directly at camera with engaged expression, natural indoor lighting"}

=== ACTOR (vary identity, keep pose/framing) ===
${actor_description || "Young female creator, natural beauty, casual style"}
- Use a DIFFERENT person than the original video
- Keep the SAME pose, framing, gesture, and energy
- Keep the SAME body language and camera relationship

=== STYLE ===
${style_description || "Natural window light, authentic TikTok/UGC aesthetic"}
Realism level: ${realism}

=== VARIATION POLICY ===
${variation_policy ? JSON.stringify(variation_policy) : "Change: actor face, background details, clothing. Maintain: composition, framing, product position, gesture, energy."}

=== PRODUCT RULES (ABSOLUTE — NON-NEGOTIABLE) ===
${product_image_url ? `A product reference image is provided below. This is the SINGLE SOURCE OF TRUTH.
- Match the EXACT packaging, color, shape, silhouette, label, branding
- Do NOT reinterpret, simplify, redesign, or approximate the product
- The product must be clearly visible and identifiable
- Same relative size and position as described in the hook frame` : "No product image provided — generate a generic scene anchor."}

=== CRITICAL REQUIREMENTS ===
1. HYPER-REALISTIC — must look like a real smartphone photo, not AI-generated
2. UGC / TikTok aesthetic — NOT cinematic, NOT commercial, NOT studio
3. Natural lighting — window light or indoor ambient
4. Smartphone camera quality — slight imperfections are good
5. The image must work as a first-frame anchor for video animation
6. 9:16 portrait orientation
7. No text overlays, no UI elements, no watermarks
8. No artificial bokeh or excessive post-processing

=== NEGATIVE CONSTRAINTS ===
- Do NOT make it look AI-generated or rendered
- Do NOT use studio lighting or professional setup
- Do NOT add text, logos, or watermarks
- Do NOT change the product in any way
- Do NOT make it cinematic or commercial-looking
- Do NOT use unrealistic skin smoothing`;

    const messages: any[] = [
      {
        role: "user",
        content: product_image_url
          ? [
              { type: "text", text: prompt },
              { type: "text", text: "Product reference image (match EXACTLY):" },
              { type: "image_url", image_url: { url: product_image_url } },
            ]
          : prompt,
      },
    ];

    console.log(`[generate-prompt-lab-reference-image] Generating for job ${job_id || "unknown"}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-prompt-lab-reference-image] Error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo en un momento." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error("El modelo no generó una imagen.");
    }

    // Upload to storage
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileName = `prompt-lab-ref/${job_id || Date.now()}_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("videos")
      .upload(fileName, bytes, { contentType: "image/png", upsert: true });

    if (uploadErr) {
      console.error("[generate-prompt-lab-reference-image] Upload error:", uploadErr);
      throw new Error("Error subiendo imagen: " + uploadErr.message);
    }

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        reference_image_url: urlData.publicUrl,
        prompt_used: prompt.substring(0, 500) + "...",
        diagnostics: {
          model: "google/gemini-3-pro-image-preview",
          platform,
          realism,
          product_locked: !!product_image_url,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-prompt-lab-reference-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
