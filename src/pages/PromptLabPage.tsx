import { useState, useCallback, useRef } from "react";
import { Loader2, Play, Copy, Check, RotateCcw, AlertCircle, Download, ChevronDown, ChevronUp, Zap, Clock, Film, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";

interface ViralJSON {
  video_type?: string;
  original_duration_seconds?: number;
  compressed_duration_seconds?: number;
  aspect_ratio?: string;
  compression_report?: { segments_removed?: string[]; segments_kept?: string[]; compression_ratio?: string };
  viral_structure?: {
    hook_type?: string;
    narrative_framework?: string;
    attention_peaks?: { timestamp: string; reason: string }[];
    editing_rhythm?: string;
    product_appearance_moments?: string[];
    cta_style?: string;
    winning_elements?: string[];
    persuasion_triggers?: string[];
  };
  style?: Record<string, string>;
  actor?: Record<string, string>;
  scenes?: {
    scene_number: number;
    start: number;
    end: number;
    type: string;
    camera_shot: string;
    camera_movement?: string;
    action: string;
    micro_actions?: string[];
    dialogue?: string;
    emotion?: string;
    facial_expression?: string;
    gaze_direction?: string;
    gesture?: string;
    product_visible?: boolean;
    product_placement?: string;
    lighting_note?: string;
    transition_to_next?: string;
    persuasion_purpose?: string;
  }[];
  product_integration?: Record<string, unknown>;
  product_reference?: Record<string, unknown>;
  context_variations?: Record<string, string>;
  negative_constraints?: string[];
  sora_prompt?: string;
  higgsfield_prompt?: string;
  [key: string]: unknown;
}

type LabStep = "input" | "analyzing" | "results";

const PromptLabPage = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<LabStep>("input");
  const [videoUrl, setVideoUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [viralJson, setViralJson] = useState<ViralJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const jobIdRef = useRef(`vjson_${Date.now()}`);

  // ── Copy helpers ──
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Error al copiar");
    }
  }, []);

  const copyFullJson = useCallback(() => {
    if (!viralJson) return;
    copyText(JSON.stringify(viralJson, null, 2), "JSON");
  }, [viralJson, copyText]);

  const copySoraPrompt = useCallback(() => {
    if (!viralJson?.sora_prompt) return;
    copyText(viralJson.sora_prompt, "Sora");
  }, [viralJson, copyText]);

  const copyHiggsfield = useCallback(() => {
    if (!viralJson?.higgsfield_prompt) return;
    copyText(viralJson.higgsfield_prompt, "Higgsfield");
  }, [viralJson, copyText]);

  const downloadJson = useCallback(() => {
    if (!viralJson) return;
    const blob = new Blob([JSON.stringify(viralJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viral-blueprint-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON descargado");
  }, [viralJson]);

  // ── Analyze ──
  const analyzeVideo = useCallback(async () => {
    if (!videoUrl.trim()) {
      toast.error("Ingresa una URL de video");
      return;
    }
    setStep("analyzing");
    setError(null);
    setViralJson(null);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id,
        job_id: jobId,
        module: "prompt_lab",
        title: `Viral JSON — ${videoUrl.substring(0, 60)}`,
        status: "running",
        current_step: "analyzing",
        source_route: "/create/prompt-lab",
        input_summary_json: { video_url: videoUrl, product_image_url: productImageUrl, notes },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-viral-structure", {
        body: {
          video_url: videoUrl.trim(),
          product_image_url: productImageUrl || undefined,
          notes: notes || undefined,
          target_duration: 12,
          language: "es-MX",
        },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setViralJson(data as ViralJSON);
      setStep("results");

      await updateHistoryRecord(jobId, {
        status: "completed",
        current_step: "results",
        output_summary_json: {
          video_type: data?.video_type,
          scenes: data?.scenes?.length || 0,
          compressed_to: data?.compressed_duration_seconds,
        },
      });
    } catch (err: any) {
      console.error("Viral JSON analysis error:", err);
      setError(err.message || "Error al analizar video");
      setStep("input");
      toast.error("Error en el análisis");

      await updateHistoryRecord(jobId, {
        status: "failed",
        error_summary: err.message,
        current_step: "analyzing",
      });
    }
  }, [videoUrl, productImageUrl, notes, user]);

  const reset = useCallback(() => {
    setStep("input");
    setViralJson(null);
    setError(null);
    jobIdRef.current = `vjson_${Date.now()}`;
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Viral Video JSON Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pega un link de video → extrae su estructura viral → genera un JSON perfecto para Sora / Higgsfield.
        </p>
      </div>

      {/* ── INPUT ── */}
      {step !== "analyzing" && !viralJson && (
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
            <ImageUploadField
              label="Imagen del producto (opcional)"
              value={productImageUrl}
              onChange={setProductImageUrl}
              prefix="viral_json_product"
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Notas (opcional)</label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Contexto, mercado, idioma, producto..."
              />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button onClick={analyzeVideo} disabled={!videoUrl.trim()} size="lg">
            <Zap className="mr-2 h-4 w-4" />
            Generar Viral JSON
          </Button>
        </div>
      )}

      {/* ── ANALYZING ── */}
      {step === "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Analizando estructura viral...</p>
            <p className="text-xs text-muted-foreground">Extrayendo timeline, escenas, hook, CTA, ritmo y lógica de persuasión.</p>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === "results" && viralJson && (
        <div className="space-y-5">

          {/* Diagnostics Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {viralJson.video_type && <Badge variant="secondary" className="text-xs">{viralJson.video_type}</Badge>}
            {viralJson.original_duration_seconds && (
              <Badge variant="outline" className="text-xs gap-1">
                <Clock className="h-3 w-3" /> Original: {viralJson.original_duration_seconds}s
              </Badge>
            )}
            {viralJson.compressed_duration_seconds && (
              <Badge variant="outline" className="text-xs gap-1">
                <Film className="h-3 w-3" /> Comprimido: {viralJson.compressed_duration_seconds}s
              </Badge>
            )}
            {viralJson.scenes && (
              <Badge variant="outline" className="text-xs gap-1">
                <Eye className="h-3 w-3" /> {viralJson.scenes.length} escenas
              </Badge>
            )}
            {viralJson.viral_structure?.hook_type && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                Hook: {viralJson.viral_structure.hook_type}
              </Badge>
            )}
            {viralJson.viral_structure?.narrative_framework && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                {viralJson.viral_structure.narrative_framework}
              </Badge>
            )}
          </div>

          {/* Winning Elements */}
          {viralJson.viral_structure?.winning_elements && viralJson.viral_structure.winning_elements.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">🏆 Winning Elements</h4>
              <div className="flex flex-wrap gap-1.5">
                {viralJson.viral_structure.winning_elements.map((el, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{el}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Scene Timeline */}
          {viralJson.scenes && viralJson.scenes.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <button
                onClick={() => setShowTimeline(!showTimeline)}
                className="flex items-center justify-between w-full"
              >
                <h4 className="text-sm font-semibold text-foreground">
                  📐 Timeline ({viralJson.scenes.length} escenas)
                </h4>
                {showTimeline ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showTimeline && (
                <div className="space-y-2">
                  {viralJson.scenes.map((scene) => (
                    <div key={scene.scene_number} className="flex gap-3 text-xs bg-muted/30 rounded-lg p-3">
                      <div className="shrink-0 w-20">
                        <Badge variant="outline" className="text-[10px] mb-1">{scene.type}</Badge>
                        <p className="text-muted-foreground font-mono">{scene.start}s – {scene.end}s</p>
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-foreground font-medium">{scene.action}</p>
                        {scene.dialogue && (
                          <p className="text-muted-foreground italic">"{scene.dialogue}"</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {scene.camera_shot && <span className="text-muted-foreground">📷 {scene.camera_shot}</span>}
                          {scene.emotion && <span className="text-muted-foreground">😊 {scene.emotion}</span>}
                          {scene.product_visible && <span className="text-primary">📦 Producto visible</span>}
                        </div>
                        {scene.micro_actions && scene.micro_actions.length > 0 && (
                          <p className="text-muted-foreground text-[11px]">
                            Micro: {scene.micro_actions.join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Export Buttons */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">📤 Exportar</h4>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyFullJson} variant="default" size="sm" className="gap-1.5">
                {copied === "JSON" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy JSON
              </Button>
              <Button onClick={copySoraPrompt} variant="outline" size="sm" className="gap-1.5" disabled={!viralJson.sora_prompt}>
                {copied === "Sora" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Export for Sora
              </Button>
              <Button onClick={copyHiggsfield} variant="outline" size="sm" className="gap-1.5" disabled={!viralJson.higgsfield_prompt}>
                {copied === "Higgsfield" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Export for Higgsfield
              </Button>
              <Button onClick={downloadJson} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download .json
              </Button>
            </div>
          </div>

          {/* Full JSON Viewer */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">🧬 JSON Completo</h4>
            <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] text-foreground whitespace-pre-wrap">
              {JSON.stringify(viralJson, null, 2)}
            </pre>
          </div>

          {/* Diagnostics (collapsible) */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-2">
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="flex items-center justify-between w-full text-sm"
            >
              <span className="font-medium text-muted-foreground">🔍 Diagnósticos</span>
              {showDiagnostics ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showDiagnostics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground uppercase text-[10px] font-medium">Duración original</span>
                  <p className="text-foreground">{viralJson.original_duration_seconds || "—"}s</p>
                </div>
                <div>
                  <span className="text-muted-foreground uppercase text-[10px] font-medium">Duración comprimida</span>
                  <p className="text-foreground">{viralJson.compressed_duration_seconds || "—"}s</p>
                </div>
                <div>
                  <span className="text-muted-foreground uppercase text-[10px] font-medium">Escenas</span>
                  <p className="text-foreground">{viralJson.scenes?.length || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground uppercase text-[10px] font-medium">Estructura</span>
                  <p className="text-foreground">{viralJson.viral_structure?.narrative_framework || "—"}</p>
                </div>
                {viralJson.compression_report && (
                  <>
                    <div className="col-span-2">
                      <span className="text-muted-foreground uppercase text-[10px] font-medium">Segmentos eliminados</span>
                      <p className="text-foreground">{viralJson.compression_report.segments_removed?.join(", ") || "Ninguno"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground uppercase text-[10px] font-medium">Segmentos conservados</span>
                      <p className="text-foreground">{viralJson.compression_report.segments_kept?.join(", ") || "Todos"}</p>
                    </div>
                  </>
                )}
                {viralJson.negative_constraints && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground uppercase text-[10px] font-medium">Restricciones negativas</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {viralJson.negative_constraints.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] text-destructive border-destructive/30">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reset */}
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Nuevo análisis
          </Button>
        </div>
      )}
    </div>
  );
};

export default PromptLabPage;
