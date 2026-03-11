import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { covers, product_image_url, product_url, language, accent, voice_tone, voice_count } = await req.json();

    if (!covers || covers.length === 0) throw new Error("At least one TikTok cover is required");
    if (!product_image_url) throw new Error("product_image_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang = language || "es-MX";
    const voiceCount = voice_count || 5;
    const tone = voice_tone || "conversational, energético, UGC natural";
    const accentLabel = accent || "mexicano";

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: `You are a senior TikTok Shop creative strategist specialized in bottom-of-funnel product ads. 

Analyze ${covers.length} winning TikTok reference video cover(s) and a product image. Your goal is to create a COMPLETE creative production brief that will be used to generate a NEW B-roll video from scratch — NOT a copy of the originals.

=== ANALYSIS TASKS ===
1. TRANSCRIPT EXTRACTION: From the cover frames and titles, infer what the original videos likely said (hooks, claims, CTAs).
2. HOOK PATTERNS: Identify the most effective opening hooks across all references.
3. CTA PATTERNS: Identify the closing calls-to-action that drive purchases.
4. BENEFIT/CLAIM PATTERNS: What product benefits or claims are repeated.
5. VISUAL PATTERNS: What visual elements, scenes, camera angles, and product presentations are common.
6. SCENE STRUCTURE: How are the ads structured (hook → demo → CTA, etc).
7. RHYTHM & PACING: Fast cuts, slow reveals, zoom-ins, etc.
8. CONTEXT & OBJECTS: What objects, environments, hands, surfaces appear repeatedly.

=== SCENE GENERATION RULES ===
Generate exactly 4 NEW scene prompts for AI image generation. These scenes will be animated into 6-second video clips each and stitched into a single master video of ~24 seconds total.

SCENE 1 — HOOK & PRODUCT REVEAL:
- Strong visual hook that grabs attention in the first frame
- Clean product reveal with the product clearly visible
- Vertical 9:16 UGC realistic framing
- The product MUST match the uploaded product image exactly

SCENE 2 — USE/DEMONSTRATION:
- Clear product usage or demonstration in action
- Context similar to what worked best in the reference videos
- Hands interacting with product if applicable
- Natural environment/setting

SCENE 3 — CLOSE-UP / BENEFIT DETAIL:
- Close-up detail shot or visual proof of the product benefit
- Focus on texture, quality, or key feature
- Product packaging clearly visible

SCENE 4 — CTA VISUAL / CLOSING:
- Implied visual CTA (urgency, satisfaction, result)
- Product prominently displayed
- Emotional or aspirational closing shot

=== IMAGE PROMPT REQUIREMENTS ===
Each image_prompt must describe:
- EXACT product appearance (from the product image — shape, color, material, packaging, branding)
- Scene setup and environment
- Camera angle and distance
- Lighting (natural, window light, golden hour — NEVER studio)
- Human interaction if relevant (hands, person using it)
- Style: smartphone UGC, NOT professional photography, NOT AI-looking
- NEVER include: text, subtitles, overlays, UI elements, watermarks, logos, captions

=== MOTION PROMPT REQUIREMENTS ===
Each motion_prompt must describe subtle realistic camera movement for a 3-5 second clip:
- Handheld drift, slow zoom, gentle pan
- Keep product in frame and sharp
- Natural smartphone recording movement
- Duration hint: "approximately 4 seconds"

=== VOICE SCRIPT REQUIREMENTS ===
Generate ${voiceCount} completely different voice-over script variants.
- Language: Mexican Spanish (es-MX) MANDATORY
- Accent: ${accentLabel} — natural, authentic Mexican creator voice
- STRICTLY PROHIBITED: Argentine accent, Spain Spanish, corporate neutral tone
- Tone: ${tone}
- Each script must be 10-15 seconds when spoken naturally
- Each variant must have a DIFFERENT hook, different wording, different CTA
- Same product and core benefit across all variants
- Include bottom-of-funnel urgency hooks like: "último día", "aprovecha hoy", "ya se está agotando", "esta oferta termina hoy", "no lo dejes pasar"
- Write as a real Mexican TikTok creator would naturally speak
- Short, punchy, conversational phrases

Product URL: ${product_url || "N/A"}
Language: ${lang}
Accent: ${accentLabel}
Voice tone: ${tone}`,
      },
      { type: "text", text: "=== PRODUCT IMAGE (ground truth for product appearance) ===" },
      { type: "image_url", image_url: { url: product_image_url } },
    ];

    for (let i = 0; i < covers.length; i++) {
      userContent.push(
        { type: "text", text: `=== REFERENCE ${i + 1} ===${covers[i].title ? ` Title: "${covers[i].title}"` : ""}` },
        { type: "image_url", image_url: { url: covers[i].cover_url } },
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are an elite TikTok Shop creative strategist. You analyze winning ads and create production briefs for NEW B-roll videos. You deeply understand what makes TikTok Shop ads convert. Your output is always structured, precise, and actionable. All voice scripts MUST be in natural Mexican Spanish — the kind a real Mexican creator would use in a casual TikTok recommendation. NEVER use Argentine, Spanish (Spain), or corporate neutral tone.`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_production_brief",
              description: "Return complete production brief with 3 scenes and voice scripts",
              parameters: {
                type: "object",
                properties: {
                  product_detected: { type: "string", description: "What product was detected" },
                  key_benefits: { type: "array", items: { type: "string" }, description: "Key benefits/claims found in references" },
                  common_hooks: { type: "array", items: { type: "string" }, description: "Most effective hooks from references" },
                  common_ctas: { type: "array", items: { type: "string" }, description: "Most effective CTAs from references" },
                  visual_patterns: { type: "array", items: { type: "string" }, description: "Visual patterns that worked (angles, scenes, lighting, objects)" },
                  scene_structure: { type: "string", description: "How the winning ads are structured (e.g. hook→demo→CTA)" },
                  rhythm_analysis: { type: "string", description: "Pacing and rhythm patterns (fast cuts, slow reveals, etc)" },
                  reference_transcripts: { type: "array", items: { type: "string" }, description: "Inferred transcripts or key phrases from each reference" },
                  ad_structure: { type: "string", description: "Overall ad structure pattern" },
                  summary_es: { type: "string", description: "Spanish summary of the creative brief and what the new video will show" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        scene_index: { type: "number" },
                        label: { type: "string", description: "Short label: 'Hook & Product Reveal', 'Use/Demo', 'Close-up & CTA'" },
                        image_prompt: {
                          type: "string",
                          description: "Detailed English prompt for generating a hyper-realistic 9:16 product image. Must describe: exact product appearance from product image (shape, color, material, packaging), scene setup, camera angle (e.g. 45-degree, overhead, eye-level), lighting (natural window light, golden hour), hands/person interaction, environment/surface. Style: authentic smartphone UGC recording, NOT professional studio, NOT AI-looking. Camera: iPhone 15 Pro, natural depth of field. Textures: real skin pores, fabric texture, surface imperfections. NEVER include text, overlays, UI, watermarks, subtitles.",
                        },
                        motion_prompt: {
                          type: "string",
                          description: "Short English prompt for subtle video animation of approximately 4 seconds. Describe: handheld camera drift direction, zoom speed, pan direction. Keep product sharp and visible. Natural smartphone recording movement. Example: 'Gentle handheld drift left to right with subtle zoom in on product label. Natural smartphone movement. Duration: approximately 4 seconds.'",
                        },
                      },
                      required: ["scene_index", "label", "image_prompt", "motion_prompt"],
                    },
                    minItems: 4,
                    maxItems: 4,
                  },
                  voice_scripts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        variant_index: { type: "number" },
                        hook: { type: "string", description: "Opening hook phrase in Mexican Spanish" },
                        body: { type: "string", description: "Main body text in Mexican Spanish" },
                        cta: { type: "string", description: "Call to action in Mexican Spanish with BOF urgency" },
                        full_text: { type: "string", description: "Complete voice-over script in Mexican Spanish. Must be 10-15 seconds when spoken naturally. Written exactly as a Mexican TikTok creator would say it — casual, authentic, no formal language." },
                        tone: { type: "string", description: "Tone description for this variant (e.g. 'urgente y directo', 'amigable y conversacional')" },
                      },
                      required: ["variant_index", "hook", "body", "cta", "full_text", "tone"],
                    },
                  },
                },
                required: ["product_detected", "key_benefits", "common_hooks", "common_ctas", "visual_patterns", "scene_structure", "ad_structure", "summary_es", "scenes", "voice_scripts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_production_brief" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit — intenta de nuevo" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured data returned");

    const brief = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    console.log("Broll Lab analysis complete:", { product: brief.product_detected, scenes: brief.scenes?.length, scripts: brief.voice_scripts?.length });

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-broll-lab error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error analyzing references" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
