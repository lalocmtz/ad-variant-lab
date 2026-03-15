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
import { buildPrompt } from "@/lib/promptRegistry";
import { saveDraft, clearDraft } from "@/lib/promptDraftStore";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";
import type { GenerationPrompt } from "@/lib/promptTypes";

type ArcadePhase = "idle" | "preparing" | "generating" | "polling" | "done" | "error";

const UGC_DEFAULTS = {
  style: "handheld, realistic UGC feel, natural speech, micro-imperfections, shot variation, believable product handling, vertical 9:16, smartphone aesthetic, natural lighting, casual tone",
};

const LANGUAGES = [
  { value: "es-MX", label: "Español (MX)" },
  { value: "es-US", label: "Español (US)" },
  { value: "es-CO", label: "Español (CO)" },
  { value: "en-US", label: "English (US)" },
];

const UgcArcadePage = () => {
  const { user } = useAuth();

  // ── Inputs ──
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [instruction, setInstruction] = useState("");
  const [language, setLanguage] = useState("es-MX");
  const [providerPref, setProviderPref] = useState("");
  const [notes, setNotes] = useState("");

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

  // ── Build prompt chain from simple instruction ──
  const buildPromptChain = useCallback(() => {
    const scriptPrompt = `You are a UGC script writer. Given the following instruction, write a short, authentic UGC-style script for a video ad.

Style: ${UGC_DEFAULTS.style}
Language: ${language}
${notes ? `Additional context: ${notes}` : ""}
${productImageUrl ? "A product image is provided — the script must include natural product handling/demonstration moments." : ""}

User instruction: "${instruction}"

Write the script with:
- Hook (0-1.5s): Attention-grabbing opening
- Body (1.5-6.5s): Authentic demonstration/recommendation
- CTA (6.5-9s): Natural call-to-action

Keep it conversational, imperfect, and believable. No polished ad language.`;

    const shotlistPrompt = `Given the following UGC script, create a detailed shot list for a 9-second vertical video.

Style: ${UGC_DEFAULTS.style}
The source image shows the person/creator who will appear in the video.
${productImageUrl ? "A product image is provided — include close-ups and handling shots of the exact product shown." : ""}

Script:
{script}

Create 3-5 shots with: shot description, camera movement (handheld micro-shakes, natural drift), duration, and mood. 
Ensure visual continuity with the source image.
NO cinematic movements. NO dramatic zooms. Smartphone-only aesthetics.`;

    const videoPrompt = `Create a UGC-style vertical video based on the following shot list.

Style: ${UGC_DEFAULTS.style}
The source image is the visual reference for the person/creator — preserve their identity and appearance.
${productImageUrl ? "The product image shows the exact product — preserve its appearance, color, texture, and packaging in all product shots." : ""}

Shot list:
{shotlist}

CRITICAL RULES:
- Handheld camera with micro-shakes and natural drift
- Natural auto-focus adjustments
- NO cinematic movements, NO dramatic zooms, NO robotic transitions
- Must look like it was filmed on a smartphone by a real content creator
- Product must be clearly visible and accurately represented when shown`;

    const allPrompts: GenerationPrompt[] = [
      buildPrompt(jobId, "ugc_arcade", "instruction_to_script_prompt", { prompt_text: scriptPrompt }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "script_to_shotlist_prompt", { prompt_text: shotlistPrompt }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "shotlist_to_video_prompt", { prompt_text: videoPrompt }, "Sora/Orchestrator"),
    ];

    setPrompts(allPrompts);
    return allPrompts;
  }, [instruction, language, notes, productImageUrl, jobId]);

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
            setErrorMsg("Polling falló después de 5 intentos. Revisa el historial.");
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

  // ── Main generate action: auto-build prompts + generate video ──
  const handleGenerate = useCallback(async () => {
    if (!sourceImageUrl.trim() || !instruction.trim()) {
      toast.error("Imagen fuente e instrucción son requeridos");
      return;
    }

    setErrorMsg(null);
    setVideoResult(null);
    setPhase("preparing");

    // 1. Auto-build prompts
    const chain = buildPromptChain();

    // 2. Create history record
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
        },
        resumable: true,
      });
    }

    // 3. Go straight to video generation
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
          metadata: { instruction, language, notes, product_image_url: productImageUrl },
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
  }, [sourceImageUrl, instruction, buildPromptChain, user, jobId, productImageUrl, language, notes, providerPref, startPolling]);

  // ── Regenerate with edited prompts ──
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
          metadata: { instruction, language, notes, product_image_url: productImageUrl },
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
  }, [prompts, sourceImageUrl, instruction, language, notes, productImageUrl, providerPref, user, startPolling]);

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
          Sube una imagen, escribe una instrucción simple y genera un video UGC realista.
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

        {/* Instruction */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">¿Qué quieres en el video? *</label>
          <Textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Ej: Una creadora de contenido promociona esta crema facial en un video muy real, estilo UGC, casual y creíble. Muestra cómo la aplica y su reacción natural."
            className="min-h-[90px] text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Escribe una instrucción simple. El sistema interpreta automáticamente el estilo, guion y shots.
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

          {/* Video player */}
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

          {/* Polling state */}
          {!videoResult.url && phase === "polling" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Esperando video del proveedor...</p>
              {videoResult.taskId && (
                <p className="text-[10px] font-mono text-muted-foreground">Task: {videoResult.taskId}</p>
              )}
            </div>
          )}

          {/* New project */}
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
