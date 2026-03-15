import { useState, useCallback } from "react";
import { Loader2, Play, Copy, Check, RotateCcw, Send, Video as VideoIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PromptSection from "@/components/prompts/PromptSection";
import { buildPrompt } from "@/lib/promptRegistry";
import { saveDraft, clearDraft } from "@/lib/promptDraftStore";
import type { GenerationPrompt } from "@/lib/promptTypes";

interface VideoBreakdown {
  hook?: string;
  scenes?: { description: string; camera: string; lighting: string; duration: string }[];
  camera_movement?: string;
  subject?: string;
  setting?: string;
  lighting?: string;
  pacing?: string;
  cta_pattern?: string;
  product_demo?: boolean;
  emotional_tone?: string;
  recreation_ideas?: string[];
  master_prompt?: string;
  scene_prompts?: string[];
}

type LabStep = "input" | "analyzing" | "results";

const PromptLabPage = () => {
  const [step, setStep] = useState<LabStep>("input");
  const [videoUrl, setVideoUrl] = useState("");
  const [productImage, setProductImage] = useState("");
  const [notes, setNotes] = useState("");
  const [breakdown, setBreakdown] = useState<VideoBreakdown | null>(null);
  const [prompts, setPrompts] = useState<GenerationPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId] = useState(() => `plab_${Date.now()}`);

  const analyzeVideo = useCallback(async () => {
    if (!videoUrl.trim()) {
      toast.error("Ingresa una URL de video");
      return;
    }
    setStep("analyzing");
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-video", {
        body: {
          video_url: videoUrl.trim(),
          variant_count: 1,
          metadata: { source: "prompt_lab" },
          product_image_url: productImage || undefined,
          language: "es-MX",
        },
      });

      if (fnErr) throw new Error(fnErr.message);

      // Extract breakdown from analysis response
      const analysis = data;
      const bd: VideoBreakdown = {
        hook: analysis?.hook_text || analysis?.hook || "",
        scenes: analysis?.beat_timeline?.map((b: any) => ({
          description: b.action || b.description || "",
          camera: b.camera_distance || b.camera || "",
          lighting: b.lighting || "",
          duration: b.duration_seconds ? `${b.duration_seconds}s` : "",
        })) || [],
        camera_movement: analysis?.visual_style?.camera_movement || "",
        subject: analysis?.visual_style?.subject_description || "",
        setting: analysis?.visual_style?.setting || "",
        lighting: analysis?.visual_style?.lighting || "",
        pacing: analysis?.pacing || "",
        cta_pattern: analysis?.cta_text || "",
        product_demo: !!analysis?.product_visibility,
        emotional_tone: analysis?.emotional_tone || analysis?.tone || "",
        recreation_ideas: [],
        master_prompt: "",
        scene_prompts: [],
      };

      // Build master recreation prompt from breakdown
      const masterParts = [
        bd.hook ? `Hook: "${bd.hook}"` : "",
        bd.subject ? `Subject: ${bd.subject}` : "",
        bd.setting ? `Setting: ${bd.setting}` : "",
        bd.lighting ? `Lighting: ${bd.lighting}` : "",
        bd.camera_movement ? `Camera: ${bd.camera_movement}` : "",
        bd.emotional_tone ? `Tone: ${bd.emotional_tone}` : "",
        bd.pacing ? `Pacing: ${bd.pacing}` : "",
        bd.cta_pattern ? `CTA: "${bd.cta_pattern}"` : "",
        bd.product_demo ? "Product demo visible in frame" : "",
        notes ? `Operator notes: ${notes}` : "",
      ].filter(Boolean);
      bd.master_prompt = masterParts.join("\n");

      // Build scene prompts
      bd.scene_prompts = (bd.scenes || []).map((s, i) =>
        `Scene ${i + 1}: ${s.description}. Camera: ${s.camera}. Lighting: ${s.lighting}. Duration: ${s.duration}`
      );

      setBreakdown(bd);

      // Build prompt objects for Prompt Surface Layer
      const allPrompts: GenerationPrompt[] = [];

      // Master recreation prompt
      allPrompts.push(
        buildPrompt(jobId, "prompt_lab" as any, "master_recreation_prompt" as any, {
          prompt_text: bd.master_prompt,
        }, "Gemini")
      );

      // Scene extraction prompt
      allPrompts.push(
        buildPrompt(jobId, "prompt_lab" as any, "scene_extraction_prompt" as any, {
          prompt_text: bd.scene_prompts?.join("\n\n") || "",
        }, "Gemini")
      );

      // Breakdown prompt (raw analysis)
      allPrompts.push(
        buildPrompt(jobId, "prompt_lab" as any, "breakdown_prompt" as any, {
          prompt_text: JSON.stringify(analysis, null, 2).slice(0, 2000),
        }, "Gemini")
      );

      setPrompts(allPrompts);
      setStep("results");
    } catch (err: any) {
      console.error("Prompt Lab analysis error:", err);
      setError(err.message || "Error al analizar video");
      setStep("input");
      toast.error("Error en el análisis");
    }
  }, [videoUrl, productImage, notes, jobId]);

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

  const sendToGenerator = useCallback(async (prompt: GenerationPrompt) => {
    toast.info(`Prompt "${prompt.stage}" enviado al generador. Usa Video Variants para ejecutar.`);
    // Copy effective prompt to clipboard for easy paste
    try {
      await navigator.clipboard.writeText(prompt.effectivePrompt);
      toast.success("Prompt copiado al portapapeles");
    } catch {
      // silent
    }
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prompt Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza un video, extrae su estructura y genera prompts editables para recreación.
        </p>
      </div>

      {/* Input */}
      {step !== "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">URL del video *</label>
            <Input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Imagen de producto (opcional)</label>
              <Input
                value={productImage}
                onChange={e => setProductImage(e.target.value)}
                placeholder="URL de imagen del producto"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Notas (opcional)</label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Contexto adicional, mercado, idioma..."
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button onClick={analyzeVideo} disabled={step === "analyzing" || !videoUrl.trim()}>
            {step === "analyzing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Analizar Video
          </Button>
        </div>
      )}

      {/* Analyzing */}
      {step === "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analizando video y extrayendo estructura...</p>
        </div>
      )}

      {/* Results */}
      {step === "results" && breakdown && (
        <div className="space-y-6">
          {/* Breakdown Summary */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Video Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {breakdown.hook && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Hook</span>
                  <p className="text-xs text-foreground">{breakdown.hook}</p>
                </div>
              )}
              {breakdown.subject && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Sujeto</span>
                  <p className="text-xs text-foreground">{breakdown.subject}</p>
                </div>
              )}
              {breakdown.setting && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Entorno</span>
                  <p className="text-xs text-foreground">{breakdown.setting}</p>
                </div>
              )}
              {breakdown.lighting && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Iluminación</span>
                  <p className="text-xs text-foreground">{breakdown.lighting}</p>
                </div>
              )}
              {breakdown.camera_movement && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Cámara</span>
                  <p className="text-xs text-foreground">{breakdown.camera_movement}</p>
                </div>
              )}
              {breakdown.emotional_tone && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Tono</span>
                  <p className="text-xs text-foreground">{breakdown.emotional_tone}</p>
                </div>
              )}
              {breakdown.pacing && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">Ritmo</span>
                  <p className="text-xs text-foreground">{breakdown.pacing}</p>
                </div>
              )}
              {breakdown.cta_pattern && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase">CTA</span>
                  <p className="text-xs text-foreground">{breakdown.cta_pattern}</p>
                </div>
              )}
            </div>

            {/* Scenes */}
            {breakdown.scenes && breakdown.scenes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Escenas ({breakdown.scenes.length})</h4>
                <div className="space-y-1.5">
                  {breakdown.scenes.map((scene, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 rounded-lg p-2.5">
                      <Badge variant="outline" className="shrink-0 text-[10px]">{i + 1}</Badge>
                      <div>
                        <p className="text-foreground">{scene.description}</p>
                        <p className="text-muted-foreground mt-0.5">
                          {[scene.camera, scene.lighting, scene.duration].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Editable Prompts */}
          <PromptSection
            title="Prompts Generados"
            prompts={prompts}
            onPromptChange={handlePromptChange}
            onPromptReset={handlePromptReset}
            defaultVisible={true}
          />

          {/* Send to Generator buttons */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Acciones</h4>
            <div className="flex flex-wrap gap-2">
              {prompts.map(p => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  onClick={() => sendToGenerator(p)}
                  className="text-xs gap-1.5"
                >
                  <Send className="h-3 w-3" />
                  Copiar "{p.stage.replace(/_/g, " ")}"
                </Button>
              ))}
            </div>
          </div>

          {/* Re-analyze */}
          <Button variant="outline" onClick={() => { setStep("input"); setBreakdown(null); setPrompts([]); }}>
            <RotateCcw className="mr-2 h-4 w-4" /> Nuevo análisis
          </Button>
        </div>
      )}
    </div>
  );
};

export default PromptLabPage;
