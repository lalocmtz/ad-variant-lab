import { useState, useCallback } from "react";
import { Loader2, Play, Upload, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PromptSection from "@/components/prompts/PromptSection";
import ExecutionTimeline from "@/components/debug/ExecutionTimeline";
import { buildPrompt } from "@/lib/promptRegistry";
import { saveDraft, clearDraft } from "@/lib/promptDraftStore";
import type { GenerationPrompt } from "@/lib/promptTypes";

type ArcadeStep = "input" | "generating_script" | "review_prompts" | "generating_video" | "done";

const UGC_DEFAULTS = {
  style: "handheld, realistic UGC feel, natural speech, micro-imperfections, shot variation, believable product handling",
};

const UgcArcadePage = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<ArcadeStep>("input");
  const [sourceImage, setSourceImage] = useState("");
  const [instruction, setInstruction] = useState("");
  const [productImage, setProductImage] = useState("");
  const [language, setLanguage] = useState("es-MX");
  const [providerPref, setProviderPref] = useState("");
  const [notes, setNotes] = useState("");
  const [prompts, setPrompts] = useState<GenerationPrompt[]>([]);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedShotlist, setGeneratedShotlist] = useState("");
  const [finalVideoPrompt, setFinalVideoPrompt] = useState("");
  const [videoResult, setVideoResult] = useState<{ url?: string; provider?: string; taskId?: string; status?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId] = useState(() => `ugc_${Date.now()}`);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Build the internal prompt chain from instruction
  const buildPromptChain = useCallback(() => {
    const scriptPromptText = `You are a UGC script writer. Given the following instruction, write a short, authentic UGC-style script for a video ad.

Style: ${UGC_DEFAULTS.style}
Language: ${language}
${notes ? `Notes: ${notes}` : ""}

Instruction: "${instruction}"

Write the script with a hook (0-3s), body (3-10s), and CTA (10-15s). Keep it natural and conversational.`;

    const shotlistPromptText = `Given the following UGC script, create a detailed shot list for video generation.

Style: ${UGC_DEFAULTS.style}
Source image context: Product/person shown in the provided image.

Script:
{script}

Create 3-5 shots with: shot description, camera angle, duration, and mood.`;

    const videoPromptText = `Create a UGC-style video based on the following shot list.

Style: ${UGC_DEFAULTS.style}
${productImage ? "Product image is provided as reference." : ""}

Shot list:
{shotlist}

Generate a realistic, handheld-feel video that looks authentic and not over-produced.`;

    const allPrompts: GenerationPrompt[] = [
      buildPrompt(jobId, "ugc_arcade", "instruction_to_script_prompt", { prompt_text: scriptPromptText }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "script_to_shotlist_prompt", { prompt_text: shotlistPromptText }, "Gemini"),
      buildPrompt(jobId, "ugc_arcade", "shotlist_to_video_prompt", { prompt_text: videoPromptText }, "Sora/Orchestrator"),
    ];

    setPrompts(allPrompts);
    return allPrompts;
  }, [instruction, language, notes, productImage, jobId]);

  const startGeneration = useCallback(async () => {
    if (!sourceImage.trim() || !instruction.trim()) {
      toast.error("Imagen y instrucción son requeridos");
      return;
    }

    setError(null);
    const chain = buildPromptChain();
    setStep("review_prompts");
    toast.success("Prompts generados. Revisa y edita antes de generar video.");
  }, [sourceImage, instruction, buildPromptChain]);

  const generateVideo = useCallback(async () => {
    setStep("generating_video");
    setError(null);

    try {
      // Get the effective video prompt (last in chain)
      const videoPrompt = prompts.find(p => p.stage === "shotlist_to_video_prompt");
      const effectivePrompt = videoPrompt?.effectivePrompt || finalVideoPrompt || "UGC style video";

      const { data, error: fnErr } = await supabase.functions.invoke("generate-video-orchestrator", {
        body: {
          job_id: jobId,
          module: "ugc_arcade",
          stage: "shotlist_to_video_prompt",
          effective_prompt: effectivePrompt,
          image_url: sourceImage.trim(),
          reference_video_url: null,
          duration: 9,
          aspect_ratio: "9:16",
          mode: "ugc",
          preferred_provider: providerPref || null,
          provider_order: providerPref ? [providerPref, "sora", "fal", "kling"] : ["sora", "fal", "kling"],
          metadata: { instruction, language, notes },
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
      setRefreshTrigger(prev => prev + 1);
      setStep("done");

      if (data?.status === "queued") {
        toast.info(`Video en cola con ${data.provider_used}. Task ID: ${data.taskId}`);
      } else if (data?.video_url) {
        toast.success(`Video generado con ${data.provider_used}`);
      } else {
        toast.warning("Generación completada pero sin URL de video");
      }
    } catch (err: any) {
      console.error("UGC Arcade generation error:", err);
      setError(err.message || "Error generando video");
      setRefreshTrigger(prev => prev + 1);
      setStep("review_prompts");
      toast.error("Error en la generación");
    }
  }, [prompts, finalVideoPrompt, sourceImage, jobId, providerPref, instruction, language, notes, user]);

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

  const reset = useCallback(() => {
    setStep("input");
    setPrompts([]);
    setVideoResult(null);
    setError(null);
    setGeneratedScript("");
    setGeneratedShotlist("");
    setFinalVideoPrompt("");
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">UGC Arcade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Imagen + instrucción simple → video UGC via orquestador con fallback automático.
        </p>
      </div>

      {/* Input Panel */}
      {(step === "input" || step === "review_prompts" || step === "done") && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Inputs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Imagen fuente *</label>
              <Input
                value={sourceImage}
                onChange={e => setSourceImage(e.target.value)}
                placeholder="URL de imagen (producto, persona, escena)"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Imagen de producto (opcional)</label>
              <Input
                value={productImage}
                onChange={e => setProductImage(e.target.value)}
                placeholder="URL de imagen del producto"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Instrucción *</label>
            <Textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Ej: Muestra a una chica aplicando el sérum en su cara frente al espejo, reacción natural de sorpresa al ver los resultados"
              className="min-h-[80px]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Idioma</label>
              <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="es-MX" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Provider preferido</label>
              <Input value={providerPref} onChange={e => setProviderPref(e.target.value)} placeholder="sora, fal, kling (vacío = auto)" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Notas</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto adicional..." />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {step === "input" && (
            <Button onClick={startGeneration} disabled={!sourceImage.trim() || !instruction.trim()}>
              <Play className="mr-2 h-4 w-4" /> Generar Prompts
            </Button>
          )}
        </div>
      )}

      {/* Generating Script spinner */}
      {step === "generating_script" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generando script y shot list...</p>
        </div>
      )}

      {/* Review Prompts */}
      {(step === "review_prompts" || step === "done") && prompts.length > 0 && (
        <div className="space-y-4">
          <PromptSection
            title="Pipeline de Prompts UGC"
            prompts={prompts}
            onPromptChange={handlePromptChange}
            onPromptReset={handlePromptReset}
            defaultVisible={true}
          />

          {step === "review_prompts" && (
            <div className="flex gap-2">
              <Button onClick={generateVideo}>
                <Play className="mr-2 h-4 w-4" /> Generar Video via Orquestador
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Generating Video */}
      {step === "generating_video" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Enviando al orquestador de video...</p>
        </div>
      )}

      {/* Results */}
      {step === "done" && videoResult && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Resultado</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{videoResult.provider || "unknown"}</Badge>
            <Badge variant={videoResult.status === "success" ? "default" : "secondary"}>
              {videoResult.status}
            </Badge>
            {videoResult.taskId && <Badge variant="outline" className="text-[10px]">Task: {videoResult.taskId}</Badge>}
          </div>
          {videoResult.url && (
            <video src={videoResult.url} controls className="w-full max-w-md rounded-lg" />
          )}
          {!videoResult.url && videoResult.taskId && (
            <p className="text-sm text-muted-foreground">Video en cola. Revisa el historial para el resultado final.</p>
          )}
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Nuevo proyecto
          </Button>
        </div>
      )}

      {/* Execution Timeline */}
      {(step === "generating_video" || step === "done" || error) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Diagnósticos</h4>
          <ExecutionTimeline jobId={jobId} refreshTrigger={refreshTrigger} />
        </div>
      )}
    </div>
  );
};

export default UgcArcadePage;
