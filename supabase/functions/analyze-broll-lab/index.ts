import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { covers, product_image_url, product_url, language, accent, voice_tone, voice_count, existing_scripts } = await req.json();

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
        text: `You are a senior TikTok UGC commercial director analyzing viral TikTok Shop videos.

Your job is to reverse engineer EXACTLY how the video behaves in the real world so we can recreate a believable UGC scene.

You must extract extremely detailed human behavior and filming style.

The goal is to reproduce a scene that feels indistinguishable from real TikTok UGC footage.

========================
DEEP ANALYSIS TASKS
========================

1. HOOK STRUCTURE
What happens in the first 2 seconds?
Is there a reveal, a question, a surprise, or direct product demonstration?

2. HUMAN BEHAVIOR
Describe precisely what the person does with the product:
- hand movements
- gestures
- body posture
- interaction with product
- natural hesitation
- pauses
- casual behavior

3. CAMERA BEHAVIOR
How the phone camera behaves:
- handheld or static
- micro shake
- camera drift
- slight reframing
- slight autofocus adjustment
- natural human framing mistakes

4. ENVIRONMENT
Describe the real environment:
- room type
- surface textures
- clutter level
- lighting source
- background objects

5. PRODUCT INTERACTION
How the product is naturally handled:
- placed
- opened
- folded
- picked up
- demonstrated

6. PACING
How fast actions occur:
- slow reveal
- quick demonstration
- casual explanation

7. UGC AUTHENTICITY DETAILS
Extract subtle realism signals:
- imperfect framing
- human pauses
- natural breathing
- micro hesitation
- slight camera wobble

========================
SCENE GENERATION
========================

Generate exactly 4 NEW scene prompts for AI image generation. These scenes will be animated into 3-second video clips each and stitched together.

Each scene MUST incorporate the extracted human behavior, camera behavior, environment context, and product interactions from the analysis above.

SCENE 1 — HOOK & PRODUCT REVEAL:
- Strong visual hook that grabs attention in the first frame
- Clean product reveal with the product clearly visible
- Vertical 9:16 UGC realistic framing — slightly off-center, casual phone angle
- The product MUST match the uploaded product image exactly

SCENE 2 — USE/DEMONSTRATION:
- Clear product usage or demonstration in action
- Hands interacting naturally with product — visible veins, natural nail imperfections
- Natural environment with real surface textures and subtle clutter
- Imperfect handheld camera angle

SCENE 3 — CLOSE-UP / BENEFIT DETAIL:
- Close-up detail shot or visual proof of the product benefit
- Focus on texture, quality, or key feature
- Natural focus falloff, slight highlight clipping
- Product packaging clearly visible with all labels accurate

SCENE 4 — CTA VISUAL / CLOSING:
- Implied visual CTA (urgency, satisfaction, result)
- Product prominently displayed in natural context
- Emotional or aspirational closing shot
- Casual smartphone recording feel

========================
IMAGE PROMPT REQUIREMENTS
========================

Each image_prompt MUST describe an ultra-photorealistic vertical 9:16 image that looks exactly like a real TikTok UGC frame captured with an iPhone 15 Pro by a normal person.

Each prompt MUST include:
- EXACT product appearance from product image (shape, color, material, packaging, branding, labels)
- The extracted human_actions behavior for that scene
- The extracted camera_behavior for natural framing
- The extracted environment_context for realistic setting
- The extracted product_interactions for natural handling

Camera: iPhone 15 Pro, natural lens distortion, subtle handheld tilt, slightly imperfect framing, natural focus falloff
Lighting: only natural — window light, indoor ambient, golden hour. Imperfect: slight highlight clipping, natural shadows, mild uneven exposure
Textures: skin pores, fingerprint marks, fabric weave, dust particles, surface imperfections, micro scratches
Surfaces: real wood grain, kitchen counter stone, bathroom ceramic, cloth fibers, plastic reflections
Human elements: real hands with visible veins, natural nail imperfections, realistic skin texture, minor skin redness
Composition: slightly off-center, casual phone recording angle, not perfectly aligned, not studio
Background: normal lived-in environment, subtle clutter allowed, household objects, nothing staged
Color grading: natural smartphone color science, warm neutral tones, not HDR, not oversaturated

STRICTLY FORBIDDEN in images: text, subtitles, overlays, UI elements, watermarks, logos, captions, studio lighting, symmetrical compositions, artificial gradients, CGI look, smooth plastic textures, AI artifacts, extra fingers, warped objects

End every image_prompt with: "If any visual element looks artificial, unrealistic, or AI-generated, regenerate the scene to ensure maximum realism."

========================
MOTION PROMPT REQUIREMENTS
========================

Each motion_prompt must describe realistic handheld TikTok UGC recording motion for ~3 seconds:
- Very subtle natural micro shake
- Slight drift left or right
- Very small vertical motion from natural breathing
- Subtle smartphone autofocus behavior
- Minor exposure adjustment
- NO cinematic camera moves, NO dramatic zooms, NO sudden cuts
- Movement should feel like natural breathing and small wrist adjustments

========================
VOICE SCRIPT REQUIREMENTS
========================

Generate ${voiceCount} completely different voice-over script variants.
- Language: Mexican Spanish (es-MX) MANDATORY
- Accent: ${accentLabel} — natural, authentic Mexican creator voice
- STRICTLY PROHIBITED: Argentine accent, Spain Spanish, corporate neutral tone
- Tone: ${tone}
- Each script must be 20-24 seconds when spoken at fast TikTok pace (rapid-fire delivery)
- Each variant must have a DIFFERENT hook, different wording, different CTA
- Same product and core benefit across all variants
- ALL ${voiceCount} variants must be UNIQUE — different angles, different emotions, different structures
- Short, punchy, conversational phrases — NO dead air, constant forward momentum
- Every sentence MUST add new information — no repetition

PACING & RETENTION STRUCTURE (MANDATORY):
- Hook (2-3s): Grab attention with curiosity, urgency, or bold statement
- Problem/Context (4-5s): Relatable pain point or situation
- Benefit 1 (3-4s): Key product advantage (stated as personal experience, NOT promise)
- Benefit 2 (3-4s): Secondary advantage or social proof angle
- Social proof (3-4s): "miles ya lo probaron", "se está agotando", testimonial-style
- CTA urgency (3-4s): Scarcity + action — "últimas unidades", "link en bio antes de que se acabe"

========================
TIKTOK SHOP ANTI-BAN COMPLIANCE (CRITICAL)
========================

FORBIDDEN PHRASES & CLAIMS — will get the ad BANNED:
- NO health promises: "te cura", "elimina", "sana", "desaparece el dolor"
- NO guaranteed results: "garantizado", "100% efectivo", "resultados asegurados"
- NO medical claims: "clínicamente probado", "recomendado por doctores" (unless truly certified)
- NO before/after promises: "antes y después", "transformación garantizada"
- NO absolute claims: "el mejor del mundo", "único en el mercado", "nada se compara"
- NO misleading urgency: fake countdown, false scarcity

ALLOWED & ENCOURAGED:
- Personal experience: "a mí me funcionó", "yo lo probé y..."
- Social proof: "miles ya lo están usando", "se está agotando"
- Real urgency: "última oportunidad con este descuento", "oferta de temporada"
- Benefit description WITHOUT promise: "ayuda a...", "diseñado para...", "ideal para..."
- Emotional hooks: curiosity, FOMO, relatability
- Discount/offer focus: "con descuento hoy", "aprovecha el precio especial"

Product URL: ${product_url || "N/A"}
Language: ${lang}
Accent: ${accentLabel}
Voice tone: ${tone}

${existing_scripts && existing_scripts.length > 0 ? `
========================
ANTI-REPETITION CONSTRAINT (CRITICAL)
========================

The following scripts were ALREADY GENERATED for this product. You MUST generate completely DIFFERENT variants.
Do NOT reuse any hook, angle, CTA, or phrasing from these existing scripts.
Use different emotions, different structures, different selling angles, different urgency tactics.

EXISTING SCRIPTS (DO NOT REPEAT):
${existing_scripts.map((s: string, i: number) => `--- Script ${i + 1} ---\n${s}`).join("\n\n")}
` : ""}`,
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
            content: `You are a senior TikTok UGC commercial director. You reverse engineer viral TikTok Shop videos to extract EXACT human behavior, camera behavior, and filming style. Your analysis enables recreating scenes that are indistinguishable from real UGC footage. You deeply understand micro-details: hand movements, camera shake, autofocus behavior, natural pauses, breathing motion. All voice scripts MUST be in natural Mexican Spanish — the kind a real Mexican creator would use in a casual TikTok recommendation. NEVER use Argentine, Spanish (Spain), or corporate neutral tone.`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_production_brief",
              description: "Return complete production brief with UGC behavior analysis, 4 scenes, and voice scripts",
              parameters: {
                type: "object",
                properties: {
                  product_detected: { type: "string" },
                  key_benefits: { type: "array", items: { type: "string" } },
                  common_hooks: { type: "array", items: { type: "string" } },
                  common_ctas: { type: "array", items: { type: "string" } },
                  visual_patterns: { type: "array", items: { type: "string" } },
                  human_actions: { type: "string", description: "Detailed description of human behavior extracted from references: hand movements, gestures, posture, product interaction, hesitation, pauses" },
                  camera_behavior: { type: "string", description: "Detailed camera behavior: handheld vs static, micro shake, drift, reframing, autofocus adjustments, framing mistakes" },
                  environment_context: { type: "string", description: "Environment details: room type, surfaces, clutter, lighting source, background objects" },
                  product_interactions: { type: "string", description: "How the product is handled: placed, opened, picked up, demonstrated, folded" },
                  ugc_authenticity_signals: { type: "string", description: "Subtle realism signals: imperfect framing, pauses, breathing, hesitation, camera wobble" },
                  scene_structure: { type: "string" },
                  rhythm_analysis: { type: "string" },
                  reference_transcripts: { type: "array", items: { type: "string" } },
                  ad_structure: { type: "string" },
                  summary_es: { type: "string" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        scene_index: { type: "number" },
                        label: { type: "string" },
                        image_prompt: { type: "string" },
                        motion_prompt: { type: "string" },
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
                        hook: { type: "string" },
                        body: { type: "string" },
                        cta: { type: "string" },
                        full_text: { type: "string" },
                        tone: { type: "string" },
                      },
                      required: ["variant_index", "hook", "body", "cta", "full_text", "tone"],
                    },
                  },
                },
                required: ["product_detected", "key_benefits", "common_hooks", "common_ctas", "visual_patterns", "human_actions", "camera_behavior", "environment_context", "product_interactions", "ugc_authenticity_signals", "scene_structure", "ad_structure", "summary_es", "scenes", "voice_scripts"],
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

    console.log("Broll Lab analysis complete:", {
      product: brief.product_detected,
      scenes: brief.scenes?.length,
      scripts: brief.voice_scripts?.length,
      hasHumanActions: !!brief.human_actions,
      hasCameraBehavior: !!brief.camera_behavior,
    });

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
