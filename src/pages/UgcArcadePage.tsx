import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Play, RotateCcw, ChevronDown, ChevronUp, Download, AlertCircle, Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PromptSection from "@/components/prompts/PromptSection";
import ImageUploadField from "@/components/shared/ImageUploadField";
import ExecutionTimeline from "@/components/debug/ExecutionTimeline";
import UgcIntentControls from "@/components/ugc/UgcIntentControls";
import { buildPrompt } from "@/lib/promptRegistry";
import { saveDraft, clearDraft } from "@/lib/promptDraftStore";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";
import type { GenerationPrompt } from "@/lib/promptTypes";
import { type UgcIntent, DEFAULT_INTENT, LABELS } from "@/lib/ugcIntentTypes";

type ArcadePhase = "idle" | "preparing" | "generating" | "polling" | "done" | "error";

const LANGUAGES = [
  { value: "es-MX", label: "Español (MX)" },
  { value: "es-US", label: "Español (US)" },
  { value: "es-CO", label: "Español (CO)" },
  { value: "en-US", label: "English (US)" },
];

// ── Intent-aware prompt builder ──────────────────────────────

function buildNegativeConstraints(intent: UgcIntent): string {
  const negatives: string[] = [];

  // Body target constraints
  const bodyMap: Record<string, string[]> = {
    axilas: ["Do NOT apply or show the product on the face, hands, or other body areas. ONLY underarm/axilla application."],
    cara: ["Do NOT apply or show the product on areas other than the face."],
    manos: ["Do NOT apply product to face or body. Focus on hands only."],
    cuerpo: ["Do NOT focus on face-only or hands-only application."],
    cabello: ["Do NOT apply the product to skin. Focus on hair only."],
  };
  if (bodyMap[intent.body_target]) negatives.push(...bodyMap[intent.body_target]);

  // Creative type constraints
  if (intent.creative_type === "recomendacion") {
    negatives.push("Do NOT turn this into generic beauty b-roll or product photography.");
    negatives.push("This MUST feel like a personal recommendation from a real person, not a commercial.");
  }
  if (intent.creative_type === "testimonio") {
    negatives.push("Do NOT make this look scripted or commercial. It must feel like a genuine testimonial.");
  }

  // Voice constraints
  if (intent.voice_mode === "dialogo_exacto") {
    negatives.push("Do NOT ignore or paraphrase the spoken dialogue. Follow the provided script EXACTLY.");
  }
  if (intent.voice_mode === "sin_voz") {
    negatives.push("Do NOT include any spoken dialogue or voiceover. Visual-only video.");
  }

  // Realism constraints
  if (intent.realism_level === "maximo") {
    negatives.push("Do NOT make the clip look cinematic, commercial, or overly polished.");
    negatives.push("Do NOT use studio lighting, professional color grading, or smooth camera movements.");
  }

  // Product lock
  if (intent.product_lock) {
    negatives.push("Do NOT alter, redesign, or approximate the product. Match the reference EXACTLY.");
  }

  // Character lock
  if (intent.character_lock) {
    negatives.push("Do NOT change the person's appearance, hairstyle, skin tone, or clothing from the source image.");
  }

  return negatives.map(n => `- ${n}`).join("\n");
}

function buildIntentContext(intent: UgcIntent): string {
  return `=== UGC INTENT CONTEXT ===
Creative type: ${LABELS.creative_type[intent.creative_type]}
Voice mode: ${LABELS.voice_mode[intent.voice_mode]}
Body/usage target: ${LABELS.body_target[intent.body_target]}
Narrative structure: ${LABELS.narrative_structure[intent.narrative_structure]}
Shot pattern: ${LABELS.shot_pattern[intent.shot_pattern]}
Product visibility: ${LABELS.product_visibility[intent.product_visibility]}
Realism level: ${LABELS.realism_level[intent.realism_level]}
CTA: ${LABELS.cta_mode[intent.cta_mode]}
Product Lock: ${intent.product_lock ? "ON — product must match reference exactly" : "OFF"}
Character Lock: ${intent.character_lock ? "ON — preserve person identity from source image" : "OFF"}
Dialogue Lock: ${intent.dialogue_lock ? "ON — follow provided dialogue literally" : "OFF"}`;
}

function buildStructureInstructions(intent: UgcIntent): string {
  const structures: Record<string, string> = {
    hook_solucion_cta: `Structure: Hook (0-1.5s) → Solution/Benefit (1.5-6.5s) → CTA (6.5-9s)
- Hook: Attention-grabbing opening that states a problem or desire
- Solution: Show the product solving the problem, demonstrate usage on ${LABELS.body_target[intent.body_target]}
- CTA: Natural call-to-action, ${intent.cta_mode !== "ninguno" ? `ending with "${LABELS.cta_mode[intent.cta_mode]}"` : "organic closing"}`,

    hook_demo_cta: `Structure: Hook (0-1.5s) → Demo (1.5-7s) → CTA (7-9s)
- Hook: Quick attention grab
- Demo: Full product demonstration on ${LABELS.body_target[intent.body_target]}, show texture, application, result
- CTA: ${intent.cta_mode !== "ninguno" ? LABELS.cta_mode[intent.cta_mode] : "Natural closing"}`,

    story_producto_cta: `Structure: Story (0-3s) → Product reveal (3-7s) → CTA (7-9s)
- Story: Personal context or mini-narrative
- Product: Introduce and show product, demonstrate on ${LABELS.body_target[intent.body_target]}
- CTA: ${intent.cta_mode !== "ninguno" ? LABELS.cta_mode[intent.cta_mode] : "Natural closing"}`,

    demo_first: `Structure: Demo-first (0-6s) → Result + CTA (6-9s)
- Demo: Jump straight into product usage on ${LABELS.body_target[intent.body_target]}, show application
- Result + CTA: Show the outcome and close naturally`,
  };
  return structures[intent.narrative_structure] || structures.hook_solucion_cta;
}

function buildShotPatternInstructions(intent: UgcIntent): string {
  const patterns: Record<string, string> = {
    one_take: "Shot style: Single continuous take. No cuts. Handheld smartphone feel with natural micro-movements.",
    "3_cuts_ugc": `Shot style: 3 distinct UGC cuts with natural transitions.
- Cut 1: Selfie/face talking (hook)
- Cut 2: Product close-up or demonstration on ${LABELS.body_target[intent.body_target]}
- Cut 3: Reaction/result + CTA
Each cut should feel like a different angle or moment, but maintain visual continuity.`,
    selfie_closeup_cta: `Shot style: 3 shots.
- Shot 1: Selfie mode, creator talking to camera
- Shot 2: Close-up of product on ${LABELS.body_target[intent.body_target]}
- Shot 3: Back to creator for CTA/reaction`,
    review_style: "Shot style: Review format. Creator holds product, shows it to camera, demonstrates, gives opinion. Handheld throughout.",
  };
  return patterns[intent.shot_pattern] || patterns["3_cuts_ugc"];
}

// ── Main component ────────────────────────────────────────────

const UgcArcadePage = () => {
  const { user } = useAuth();

  // ── Inputs ──
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [instruction, setInstruction] = useState("");
  const [language, setLanguage] = useState("es-MX");
  const [providerPref, setProviderPref] = useState("");
  const [notes, setNotes] = useState("");
  const [intent, setIntent] = useState<UgcIntent>(DEFAULT_INTENT);

  // ── State ──
  const [phase, setPhase] = useState<ArcadePhase>("idle");
  const [prompts, setPrompts] = useState<GenerationPrompt[]>([]);
  const [videoResult, setVideoResult] = useState<{ url?: string; provider?: string; taskId?: string; status?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState(() => `ugc_${Date.now()}`);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailCount = useRef(0);

  // ── Cleanup polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Build intent-enriched prompt chain ──
  const buildPromptChain = useCallback(() => {
    const intentCtx = buildIntentContext(intent);
    const structureInstr = buildStructureInstructions(intent);
    const shotInstr = buildShotPatternInstructions(intent);
    const negatives = buildNegativeConstraints(intent);

    const voiceModeInstr = intent.voice_mode === "dialogo_exacto"
      ? `\n\nIMPORTANT: The user has provided EXACT dialogue. Treat the instruction text as spoken lines. Divide them into timed beats. The script MUST follow this dialogue verbatim — do not paraphrase, summarize, or rewrite.`
      : intent.voice_mode === "dialogo_guiado"
      ? `\n\nThe user's instruction provides guided dialogue. You may paraphrase slightly for natural flow, but MUST preserve the core message, claims, and CTA intent.`
      : `\n\nThis is a visual-only video with NO spoken dialogue. Create visual storytelling beats instead.`;

    const scriptPrompt = `You are a UGC script writer specializing in authentic social media video ads.

${intentCtx}

${structureInstr}

Language: ${language}
${notes ? `Additional context: ${notes}` : ""}
${productImageUrl ? "A product image is provided — the script must include natural product handling/demonstration moments matching the product reference exactly." : ""}
${voiceModeInstr}

User instruction: "${instruction}"

Write the script following the exact narrative structure above.
${intent.creative_type === "recomendacion" ? "This must feel like a genuine personal recommendation. The creator truly likes this product and wants to share it." : ""}
${intent.creative_type === "problema_solucion" ? "Open with a relatable problem, then present the product as the natural solution." : ""}
${intent.creative_type === "testimonio" ? "Frame this as a genuine testimonial. First-person experience with real emotions." : ""}

Keep it conversational, imperfect, and believable. No polished ad language.

=== NEGATIVE CONSTRAINTS ===
${negatives}`;

    const shotlistPrompt = `Given the following UGC script, create a detailed shot list for a 9-second vertical 9:16 video.

${intentCtx}

${shotInstr}

The source image shows the person/creator who will appear in the video.
${intent.character_lock ? "CHARACTER LOCK: The person must look EXACTLY like the source image — same face, hair, skin tone, clothing." : ""}
${productImageUrl ? "PRODUCT LOCK: A product image is provided — include close-ups and handling shots of the EXACT product shown. Do not redesign or approximate it." : ""}

Product usage area: ${LABELS.body_target[intent.body_target]}
Product visibility: ${LABELS.product_visibility[intent.product_visibility]}

Script:
{script}

Create shots with: shot description, camera movement (handheld micro-shakes, natural drift), duration, and mood.
Ensure visual continuity with the source image.
NO cinematic movements. NO dramatic zooms. Smartphone-only aesthetics.

=== NEGATIVE CONSTRAINTS ===
${negatives}`;

    const videoPrompt = `Create a UGC-style vertical 9:16 video based on the following shot list.

${intentCtx}

The source image is the visual reference for the person/creator — preserve their identity and appearance exactly.
${productImageUrl ? "The product image shows the EXACT product — preserve its appearance, color, texture, packaging, and branding in all product shots." : ""}

${shotInstr}

Product usage area: ${LABELS.body_target[intent.body_target]}

Shot list:
{shotlist}

${intent.voice_mode === "dialogo_exacto" ? `=== GUION ===
The following is the exact spoken dialogue for this video. The video MUST match this timing:
"${instruction}"` : ""}

=== CRITICAL RULES ===
- Handheld camera with micro-shakes and natural drift
- Natural auto-focus adjustments
- ${intent.realism_level === "maximo" ? "MAXIMUM REALISM: Must look indistinguishable from a real smartphone recording" : intent.realism_level === "balanceado" ? "Balanced realism with slight polish allowed" : "More polished look acceptable, but still UGC feel"}
- Product must be clearly visible and accurately represented when shown
- Product is used on: ${LABELS.body_target[intent.body_target]} — do NOT show it applied to other body areas

=== NEGATIVE CONSTRAINTS ===
${negatives}

=== PRIORITY ORDER ===
1. Correct body/usage target (${LABELS.body_target[intent.body_target]})
2. Product accuracy (exact match to reference)
3. Character identity preservation
4. Narrative structure compliance
5. Dialogue fidelity (${LABELS.voice_mode[intent.voice_mode]})
6. Shot pattern (${LABELS.shot_pattern[intent.shot_pattern]})
7. Realism level (${LABELS.realism_level[intent.realism_level]})`;

    const allPrompts: GenerationPrompt[] = [
      buildPrompt(jobId, "ugc_arcade", "instruction_to_script_prompt", { prompt_text: scriptPrompt }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "script_to_shotlist_prompt", { prompt_text: shotlistPrompt }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "shotlist_to_video_prompt", { prompt_text: videoPrompt }, "Sora/Orchestrator"),
    ];

    setPrompts(allPrompts);
    return allPrompts;
  }, [instruction, language, notes, productImageUrl, jobId, intent]);

  // ── Polling for queued videos ──
  const startPolling = useCallback((taskId: string, provider: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollFailCount.current = 0;

    pollRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-video-task", {
          body: { taskId, engine: provider },
        });

        if (error) {
          pollFailCount.current++;
          if (pollFailCount.current >= 5) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setErrorMsg("Polling falló después de 5 intentos.");
            setPhase("error");
          }
          return;
        }

        const status = data?.status;
        const videoUrl = data?.videoUrl || data?.video_url;

        if (status === "completed" && videoUrl) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setVideoResult(prev => ({ ...prev, url: videoUrl, status: "completed" }));
          setPhase("done");
          setRefreshTrigger(t => t + 1);
          toast.success("¡Video listo!");
          await updateHistoryRecord(jobId, {
            status: "completed",
            output_summary_json: { video_url: videoUrl, task_id: taskId, provider },
          });
        } else if (status === "failed" || data?.shouldStopPolling) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setErrorMsg(data?.error || "El proveedor reportó un fallo.");
          setPhase("error");
          setRefreshTrigger(t => t + 1);
          await updateHistoryRecord(jobId, { status: "failed", error_summary: data?.error });
        } else {
          setVideoResult(prev => ({ ...prev, status: status || "processing" }));
        }
      } catch {
        pollFailCount.current++;
        if (pollFailCount.current >= 5) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPhase("error");
          setErrorMsg("Error de red durante polling.");
        }
      }
    }, 8000);
  }, [jobId]);

  // ── Main generate action ──
  const handleGenerate = useCallback(async () => {
    if (!sourceImageUrl.trim() || !instruction.trim()) {
      toast.error("Imagen fuente e instrucción son requeridos");
      return;
    }

    setErrorMsg(null);
    setVideoResult(null);
    setPhase("preparing");

    const chain = buildPromptChain();

    if (user) {
      await createHistoryRecord({
        user_id: user.id,
        job_id: jobId,
        module: "ugc_arcade",
        title: `UGC — ${instruction.substring(0, 60)}`,
        status: "running",
        current_step: "generating_video",
        source_route: "/create/ugc-arcade",
        preview_url: sourceImageUrl,
        input_summary_json: {
          source_image_url: sourceImageUrl,
          product_image_url: productImageUrl,
          instruction,
          language,
          notes,
          ugc_intent: intent,
        },
        resumable: true,
      });
    }

    setPhase("generating");

    try {
      const videoPrompt = chain.find(p => p.stage === "shotlist_to_video_prompt");
      const effectivePrompt = videoPrompt?.effectivePrompt || "UGC style video";

      const { data, error: fnErr } = await supabase.functions.invoke("generate-video-orchestrator", {
        body: {
          job_id: jobId,
          module: "ugc_arcade",
          stage: "shotlist_to_video_prompt",
          effective_prompt: effectivePrompt,
          image_url: sourceImageUrl.trim(),
          reference_video_url: null,
          duration: 9,
          aspect_ratio: "9:16",
          mode: "ugc",
          preferred_provider: providerPref || null,
          provider_order: providerPref ? [providerPref, "sora", "fal", "kling"] : ["sora", "fal", "kling"],
          metadata: {
            instruction,
            language,
            notes,
            product_image_url: productImageUrl,
            ugc_intent: intent,
          },
          user_id: user?.id,
        },
      });

      if (fnErr) throw new Error(fnErr.message);

      const result = {
        url: data?.video_url || null,
        provider: data?.provider_used || null,
        taskId: data?.taskId || null,
        status: data?.status || "unknown",
      };

      setVideoResult(result);
      setRefreshTrigger(t => t + 1);

      await updateHistoryRecord(jobId, {
        status: data?.video_url ? "completed" : "queued",
        current_step: "done",
        provider_used: data?.provider_used,
        output_summary_json: {
          video_url: data?.video_url,
          task_id: data?.taskId,
          provider: data?.provider_used,
        },
      });

      if (data?.video_url) {
        setPhase("done");
        toast.success(`Video generado con ${data.provider_used}`);
      } else if (data?.taskId) {
        setPhase("polling");
        toast.info(`Video en cola con ${data.provider_used}. Esperando resultado...`);
        startPolling(data.taskId, data.provider_used);
      } else {
        setPhase("done");
        toast.warning("Generación completada sin URL de video");
      }
    } catch (err: any) {
      console.error("UGC Arcade generation error:", err);
      setErrorMsg(err.message || "Error generando video");
      setPhase("error");
      setRefreshTrigger(t => t + 1);
      toast.error("Error en la generación");

      await updateHistoryRecord(jobId, {
        status: "failed",
        error_summary: err.message,
        current_step: "generating_video",
      });
    }
  }, [sourceImageUrl, instruction, buildPromptChain, user, jobId, productImageUrl, language, notes, providerPref, startPolling, intent]);

  // ── Regenerate ──
  const handleRegenerate = useCallback(async () => {
    setPhase("generating");
    setErrorMsg(null);
    setVideoResult(null);

    const newJobId = `ugc_${Date.now()}`;
    setJobId(newJobId);

    try {
      const videoPrompt = prompts.find(p => p.stage === "shotlist_to_video_prompt");
      const effectivePrompt = videoPrompt?.effectivePrompt || "UGC style video";

      if (user) {
        await createHistoryRecord({
          user_id: user.id,
          job_id: newJobId,
          module: "ugc_arcade",
          title: `UGC (retry) — ${instruction.substring(0, 50)}`,
          status: "running",
          current_step: "generating_video",
          source_route: "/create/ugc-arcade",
          preview_url: sourceImageUrl,
          input_summary_json: {
            source_image_url: sourceImageUrl,
            product_image_url: productImageUrl,
            instruction,
            language,
            notes,
            ugc_intent: intent,
          },
        });
      }

      const { data, error: fnErr } = await supabase.functions.invoke("generate-video-orchestrator", {
        body: {
          job_id: newJobId,
          module: "ugc_arcade",
          stage: "shotlist_to_video_prompt",
          effective_prompt: effectivePrompt,
          image_url: sourceImageUrl.trim(),
          reference_video_url: null,
          duration: 9,
          aspect_ratio: "9:16",
          mode: "ugc",
          preferred_provider: providerPref || null,
          provider_order: providerPref ? [providerPref, "sora", "fal", "kling"] : ["sora", "fal", "kling"],
          metadata: { instruction, language, notes, product_image_url: productImageUrl, ugc_intent: intent },
          user_id: user?.id,
        },
      });

      if (fnErr) throw new Error(fnErr.message);

      setVideoResult({
        url: data?.video_url || null,
        provider: data?.provider_used || null,
        taskId: data?.taskId || null,
        status: data?.status || "unknown",
      });
      setRefreshTrigger(t => t + 1);

      if (data?.video_url) {
        setPhase("done");
        toast.success(`Video regenerado con ${data.provider_used}`);
      } else if (data?.taskId) {
        setPhase("polling");
        startPolling(data.taskId, data.provider_used);
      } else {
        setPhase("done");
      }

      await updateHistoryRecord(newJobId, {
        status: data?.video_url ? "completed" : "queued",
        provider_used: data?.provider_used,
        output_summary_json: { video_url: data?.video_url, task_id: data?.taskId, provider: data?.provider_used },
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Error regenerando video");
      setPhase("error");
      setRefreshTrigger(t => t + 1);
    }
  }, [prompts, sourceImageUrl, instruction, language, notes, productImageUrl, providerPref, user, startPolling, intent]);

  // ── Prompt handlers ──
  const handlePromptChange = useCallback((promptId: string, newText: string) => {
    setPrompts(prev => prev.map(p => {
      if (p.id !== promptId) return p;
      const isModified = newText !== p.defaultPrompt;
      saveDraft(p.jobId, p.module, p.stage, newText);
      return { ...p, editedPrompt: newText, effectivePrompt: newText, isUserModified: isModified };
    }));
  }, []);

  const handlePromptReset = useCallback((promptId: string) => {
    setPrompts(prev => prev.map(p => {
      if (p.id !== promptId) return p;
      clearDraft(p.jobId, p.module, p.stage);
      return { ...p, editedPrompt: null, effectivePrompt: p.defaultPrompt, isUserModified: false };
    }));
  }, []);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("idle");
    setPrompts([]);
    setVideoResult(null);
    setErrorMsg(null);
    setJobId(`ugc_${Date.now()}`);
    setSourceImageUrl("");
    setProductImageUrl("");
    setInstruction("");
    setNotes("");
    setIntent(DEFAULT_INTENT);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!videoResult?.url) return;
    try {
      const res = await fetch(videoResult.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ugc_${jobId}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Error descargando video");
    }
  }, [videoResult, jobId]);

  const isGenerating = phase === "preparing" || phase === "generating" || phase === "polling";
  const canGenerate = sourceImageUrl.trim().length > 0 && instruction.trim().length > 0 && !isGenerating;
  const hasResult = phase === "done" || phase === "error" || phase === "polling";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">UGC Arcade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube una imagen, configura la intención y genera un video UGC realista con interpretación precisa.
        </p>
      </div>

      {/* ═══ INPUT SECTION ═══ */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        {/* Images side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          <ImageUploadField
            label="Imagen fuente"
            value={sourceImageUrl}
            onChange={setSourceImageUrl}
            required
            prefix="ugc_source"
          />
          <ImageUploadField
            label="Imagen de producto"
            value={productImageUrl}
            onChange={setProductImageUrl}
            prefix="ugc_product"
          />
        </div>

        {/* UGC Intent Controls — presets + semantic chips */}
        <div className="border-t border-border/50 pt-4">
          <UgcIntentControls intent={intent} onChange={setIntent} />
        </div>

        {/* Instruction */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {intent.voice_mode === "dialogo_exacto"
              ? "Guion hablado exacto *"
              : "¿Qué quieres en el video? *"}
          </label>
          <Textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={
              intent.voice_mode === "dialogo_exacto"
                ? 'Ej: "¿Ya probaron esta crema para las axilas? Es que yo tenía un problema con las manchas y desde que la uso mis axilas están como nuevas. Se las súper recomiendo, está en mi TikTok Shop."'
                : "Ej: Una creadora recomienda esta crema para axilas, con demostración de aplicación y CTA de TikTok Shop."
            }
            className="min-h-[90px] text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            {intent.voice_mode === "dialogo_exacto"
              ? "El sistema tratará este texto como diálogo literal. Se respetará lo más posible."
              : "Escribe una instrucción o brief. El sistema interpreta automáticamente usando los controles seleccionados."}
          </p>
        </div>

        {/* Advanced options — collapsed */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Settings2 className="h-3.5 w-3.5" />
              Opciones avanzadas
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Idioma</label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                <Select value={providerPref || "auto"} onValueChange={v => setProviderPref(v === "auto" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (fallback)</SelectItem>
                    <SelectItem value="sora">Sora</SelectItem>
                    <SelectItem value="fal">fal.ai</SelectItem>
                    <SelectItem value="kling">Kling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contexto extra..."
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* CTA */}
        <Button
          onClick={canGenerate ? handleGenerate : undefined}
          disabled={!canGenerate}
          className="w-full h-11 gap-2 gradient-primary text-primary-foreground font-semibold"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "preparing" && "Preparando prompts..."}
              {phase === "generating" && "Generando video..."}
              {phase === "polling" && "Esperando resultado..."}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generar Video UGC
            </>
          )}
        </Button>
      </div>

      {/* ═══ ERROR ═══ */}
      {errorMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRegenerate} className="h-7 text-xs">
                <RotateCcw className="h-3 w-3 mr-1" /> Reintentar
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset} className="h-7 text-xs">
                Nuevo proyecto
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INLINE RESULT ═══ */}
      {hasResult && videoResult && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Resultado</h3>
            <div className="flex items-center gap-2">
              {videoResult.provider && (
                <Badge variant="outline" className="text-[10px]">{videoResult.provider}</Badge>
              )}
              <Badge
                variant={videoResult.status === "completed" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {videoResult.status === "completed" ? "✓ Listo" :
                 videoResult.status === "processing" || videoResult.status === "queued" ? "⏳ Procesando" :
                 videoResult.status}
              </Badge>
            </div>
          </div>

          {videoResult.url && (
            <div className="flex flex-col items-center gap-3">
              <video
                src={videoResult.url}
                controls
                className="w-full max-w-sm rounded-lg border border-border shadow-sm"
                style={{ aspectRatio: "9/16", maxHeight: "480px", objectFit: "contain" }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDownload} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Descargar Video
                </Button>
                <Button size="sm" variant="outline" onClick={handleRegenerate} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Regenerar
                </Button>
              </div>
            </div>
          )}

          {!videoResult.url && phase === "polling" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Esperando video del proveedor...</p>
              {videoResult.taskId && (
                <p className="text-[10px] font-mono text-muted-foreground">Task: {videoResult.taskId}</p>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-border/50">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3 mr-1" /> Nuevo proyecto
            </Button>
          </div>
        </div>
      )}

      {/* ═══ AUTO-GENERATED PROMPTS (collapsed) ═══ */}
      {prompts.length > 0 && (
        <PromptSection
          title="Prompts generados automáticamente"
          prompts={prompts}
          onPromptChange={handlePromptChange}
          onPromptReset={handlePromptReset}
          defaultVisible={false}
        />
      )}

      {/* ═══ DIAGNOSTICS (collapsed) ═══ */}
      {(isGenerating || hasResult || errorMsg) && (
        <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Diagnósticos
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ExecutionTimeline jobId={jobId} refreshTrigger={refreshTrigger} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default UgcArcadePage;
