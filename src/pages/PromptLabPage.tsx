import { useState, useCallback, useRef } from "react";
import {
  Loader2, Copy, Check, RotateCcw, AlertCircle, Download,
  ChevronDown, ChevronUp, Zap, Clock, Film, Eye, Image as ImageIcon,
  ExternalLink, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";
import { buildReferenceImagePrompt, resolveVars, REFERENCE_IMAGE_REALISM_MODE, type ReferenceImageVars } from "@/lib/referenceImagePrompt";

/* ── Types ── */
interface ViralJSON {
  target_platform?: string;
  video_type?: string;
  original_duration_seconds?: number;
  compressed_duration_seconds?: number;
  aspect_ratio?: string;
  dialogue_mode?: string;
  realism_level?: string;
  language_lock?: Record<string, unknown>;
  product_lock?: Record<string, unknown>;
  actor_strategy?: Record<string, unknown>;
  variation_policy?: Record<string, unknown>;
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
    scene_number: number; start: number; end: number; type: string;
    camera_shot: string; camera_movement?: string; action: string;
    micro_actions?: string[]; dialogue?: string; spoken_language?: string;
    emotion?: string; facial_expression?: string; gaze_direction?: string;
    gesture?: string; body_posture?: string; product_visible?: boolean;
    product_placement?: string; lighting_note?: string;
    transition_to_next?: string; persuasion_purpose?: string; continuity_note?: string;
  }[];
  spoken_lines?: { start: number; end: number; text: string; emotion?: string; language?: string }[];
  product_integration?: Record<string, unknown>;
  product_reference?: Record<string, unknown>;
  context_variations?: Record<string, string>;
  continuity_rules?: string[];
  negative_constraints?: string[];
  platform_notes?: string;
  sora_prompt?: string;
  higgsfield_prompt?: string;
  hook_frame_description?: string;
  [key: string]: unknown;
}

type LabStep = "input" | "analyzing" | "generating_image" | "results";

/* ── Component ── */
const PromptLabPage = () => {
  const { user } = useAuth();

  // Flow state
  const [step, setStep] = useState<LabStep>("input");
  const [error, setError] = useState<string | null>(null);
  const jobIdRef = useRef(`vjson_${Date.now()}`);

  // Input state
  const [videoUrl, setVideoUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [generateRefImage, setGenerateRefImage] = useState(false);

  // Advanced options
  const [targetPlatform, setTargetPlatform] = useState("generic");
  const [language, setLanguage] = useState("es-MX");
  const [targetDuration, setTargetDuration] = useState("12");
  const [variationLevel, setVariationLevel] = useState("moderate");
  const [productLock, setProductLock] = useState(true);
  const [languageLock, setLanguageLock] = useState(true);
  const [realismLevel, setRealismLevel] = useState("maximum");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Results
  const [viralJson, setViralJson] = useState<ViralJSON | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  // UI
  const [copied, setCopied] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showFullJson, setShowFullJson] = useState(false);

  /* ── Copy helpers ── */
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error("Error al copiar"); }
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
    const a = document.createElement("a"); a.href = url;
    a.download = `viral-blueprint-${targetPlatform}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON descargado");
  }, [viralJson, targetPlatform]);

  /* ── Generate Reference Image (uses centralized master prompt) ── */
  const generateReferenceImage = useCallback(async (json: ViralJSON) => {
    setGeneratingImage(true);
    setStep("generating_image");
    try {
      const hookScene = json.scenes?.[0];
      const vars: ReferenceImageVars = {
        source_hook_summary: json.hook_frame_description || hookScene?.action || undefined,
        creator_action: hookScene?.action || undefined,
        body_target: hookScene?.body_posture || undefined,
        environment_hint: json.style?.environment || undefined,
        product_visibility_mode: hookScene?.product_visible ? "clearly visible" : "context-appropriate",
        context_variation_level: variationLevel === "minimal" ? "very slight" : variationLevel === "high" ? "significant" : "slight variation only",
        target_platform: targetPlatform,
        language_market_hint: language === "es-MX" ? "visual style aligned to Mexican TikTok Shop UGC" : language === "pt-BR" ? "visual style aligned to Brazilian TikTok Shop UGC" : undefined,
        actor_description: json.actor ? Object.values(json.actor).filter(Boolean).join(", ") : undefined,
        style_description: json.style ? Object.values(json.style).filter(Boolean).join(", ") : undefined,
      };

      // Log resolved vars for debugging
      const resolved = resolveVars(vars);
      console.log("[PromptLab] Reference image vars:", resolved);

      const { data, error: fnErr } = await supabase.functions.invoke("generate-prompt-lab-reference-image", {
        body: {
          job_id: jobIdRef.current,
          source_video_url: videoUrl,
          product_image_url: productImageUrl || undefined,
          hook_frame_description: resolved.source_hook_summary,
          actor_description: resolved.actor_description || undefined,
          style_description: resolved.style_description || undefined,
          body_target: resolved.body_target,
          environment_hint: resolved.environment_hint,
          product_visibility_mode: resolved.product_visibility_mode,
          context_variation_level: resolved.context_variation_level,
          language_market_hint: resolved.language_market_hint,
          variation_policy: json.variation_policy,
          target_platform: targetPlatform,
          language,
          realism_level: REFERENCE_IMAGE_REALISM_MODE,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      setReferenceImageUrl(data.reference_image_url);
      toast.success("Imagen de referencia generada");
    } catch (err: any) {
      console.error("Reference image error:", err);
      toast.error("Error generando imagen de referencia");
    } finally {
      setGeneratingImage(false);
      setStep("results");
    }
  }, [videoUrl, productImageUrl, targetPlatform, language, realismLevel, variationLevel]);

  /* ── Analyze Video ── */
  const analyzeVideo = useCallback(async () => {
    if (!videoUrl.trim()) { toast.error("Ingresa una URL de video"); return; }
    setStep("analyzing");
    setError(null);
    setViralJson(null);
    setReferenceImageUrl(null);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "prompt_lab",
        title: `Viral JSON — ${videoUrl.substring(0, 60)}`,
        status: "running", current_step: "analyzing",
        source_route: "/create/prompt-lab",
        input_summary_json: { video_url: videoUrl, product_image_url: productImageUrl, notes, target_platform: targetPlatform, generate_ref_image: generateRefImage },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-viral-structure", {
        body: {
          video_url: videoUrl.trim(),
          product_image_url: productImageUrl || undefined,
          notes: notes || undefined,
          target_duration: parseInt(targetDuration) || 12,
          language,
          target_platform: targetPlatform,
          product_lock_enabled: productLock,
          language_lock_enabled: languageLock,
          realism_level: realismLevel,
          variation_level: variationLevel,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      const json = data as ViralJSON;
      setViralJson(json);

      if (generateRefImage) {
        await generateReferenceImage(json);
      } else {
        setStep("results");
      }

      await updateHistoryRecord(jobId, {
        status: "completed", current_step: "results",
        output_summary_json: {
          video_type: json.video_type,
          scenes: json.scenes?.length || 0,
          compressed_to: json.compressed_duration_seconds,
          platform: json.target_platform,
          ref_image_generated: generateRefImage,
        },
      });
    } catch (err: any) {
      console.error("Viral JSON analysis error:", err);
      setError(err.message || "Error al analizar video");
      setStep("input");
      toast.error("Error en el análisis");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message, current_step: "analyzing" });
    }
  }, [videoUrl, productImageUrl, notes, user, targetDuration, language, targetPlatform, productLock, languageLock, realismLevel, variationLevel, generateRefImage, generateReferenceImage]);

  const reset = useCallback(() => {
    setStep("input"); setViralJson(null); setReferenceImageUrl(null);
    setError(null); setGeneratingImage(false);
    jobIdRef.current = `vjson_${Date.now()}`;
  }, []);

  const CopyBtn = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <Button onClick={onClick} variant={label === "JSON" ? "default" : "outline"} size="sm" className="gap-1.5" disabled={disabled}>
      {copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label === "JSON" ? "Copy JSON" : `Export ${label}`}
    </Button>
  );

  /* ── RENDER ── */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Viral JSON + Reference Image Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pega un link de video → extrae su estructura viral → genera JSON + imagen de referencia para Sora / Higgsfield.
        </p>
      </div>

      {/* ── INPUT ── */}
      {step === "input" && !viralJson && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          {/* Core inputs */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">URL del video *</Label>
            <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://www.tiktok.com/@user/video/..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploadField label="Imagen del producto (opcional)" value={productImageUrl} onChange={setProductImageUrl} prefix="viral_json_product" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notas (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto, mercado, producto..." rows={3} />
            </div>
          </div>

          {/* Export target */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Plataforma destino</Label>
              <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sora">Sora</SelectItem>
                  <SelectItem value="higgsfield">Higgsfield</SelectItem>
                  <SelectItem value="generic">Generic JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Idioma de salida</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="es-MX">Español mexicano</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Duración objetivo</Label>
              <Select value={targetDuration} onValueChange={setTargetDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 segundos</SelectItem>
                  <SelectItem value="10">10 segundos</SelectItem>
                  <SelectItem value="12">12 segundos</SelectItem>
                  <SelectItem value="15">15 segundos</SelectItem>
                  <SelectItem value="20">20 segundos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggles row */}
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Switch id="ref-img" checked={generateRefImage} onCheckedChange={setGenerateRefImage} />
              <Label htmlFor="ref-img" className="text-sm cursor-pointer">Generar imagen de referencia</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="prod-lock" checked={productLock} onCheckedChange={setProductLock} />
              <Label htmlFor="prod-lock" className="text-sm cursor-pointer">Product Lock</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="lang-lock" checked={languageLock} onCheckedChange={setLanguageLock} />
              <Label htmlFor="lang-lock" className="text-sm cursor-pointer">Language Lock</Label>
            </div>
          </div>

          {/* Advanced options */}
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Opciones avanzadas
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 rounded-lg p-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Nivel de variación contextual</Label>
                <Select value={variationLevel} onValueChange={setVariationLevel}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Mínima — muy cercano al original</SelectItem>
                    <SelectItem value="moderate">Moderada — clon estructural</SelectItem>
                    <SelectItem value="high">Alta — misma lógica, contexto diferente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Nivel de realismo</Label>
                <Select value={realismLevel} onValueChange={setRealismLevel}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maximum">Máximo realismo UGC</SelectItem>
                    <SelectItem value="balanced">Balanceado</SelectItem>
                    <SelectItem value="polished">Más pulido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {/* Submit */}
          <Button onClick={analyzeVideo} disabled={!videoUrl.trim()} size="lg" className="gap-2">
            <Zap className="h-4 w-4" />
            Analizar y generar {generateRefImage ? "JSON + Imagen" : "JSON"}
          </Button>
        </div>
      )}

      {/* ── ANALYZING ── */}
      {step === "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Analizando estructura viral...</p>
            <p className="text-xs text-muted-foreground">Extrayendo timeline, escenas, hook, CTA, ritmo, diálogo y lógica de persuasión.</p>
          </div>
        </div>
      )}

      {/* ── GENERATING IMAGE ── */}
      {step === "generating_image" && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Generando imagen de referencia...</p>
            <p className="text-xs text-muted-foreground">Creando anchor frame hiperrealista basado en la estructura del hook.</p>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === "results" && viralJson && (
        <div className="space-y-5">

          {/* A) Diagnostics Bar */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">📊 Diagnóstico del video</h4>
            <div className="flex flex-wrap items-center gap-2">
              {viralJson.video_type && <Badge variant="secondary" className="text-xs">{viralJson.video_type}</Badge>}
              {viralJson.target_platform && (
                <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                  {viralJson.target_platform.toUpperCase()}
                </Badge>
              )}
              {viralJson.original_duration_seconds && (
                <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" /> Original: {viralJson.original_duration_seconds}s</Badge>
              )}
              {viralJson.compressed_duration_seconds && (
                <Badge variant="outline" className="text-xs gap-1"><Film className="h-3 w-3" /> Comprimido: {viralJson.compressed_duration_seconds}s</Badge>
              )}
              {viralJson.scenes && (
                <Badge variant="outline" className="text-xs gap-1"><Eye className="h-3 w-3" /> {viralJson.scenes.length} escenas</Badge>
              )}
              {viralJson.viral_structure?.hook_type && (
                <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Hook: {viralJson.viral_structure.hook_type}</Badge>
              )}
              {viralJson.dialogue_mode && (
                <Badge variant="outline" className="text-xs">🗣️ {viralJson.dialogue_mode}</Badge>
              )}
            </div>

            {/* Locks status */}
            <div className="flex flex-wrap gap-2 text-[11px]">
              {viralJson.language_lock && (
                <span className="text-muted-foreground">🔒 Language: {(viralJson.language_lock as any).language || "—"}</span>
              )}
              {viralJson.product_lock && (
                <span className="text-muted-foreground">🔒 Product Lock: {(viralJson.product_lock as any).enabled ? "ON" : "OFF"}</span>
              )}
              {viralJson.variation_policy && (
                <span className="text-muted-foreground">🔄 Variation: {(viralJson.variation_policy as any).variation_level || "moderate"}</span>
              )}
            </div>
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

          {/* Spoken Lines */}
          {viralJson.spoken_lines && viralJson.spoken_lines.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">🗣️ Diálogo hablado</h4>
              <div className="space-y-1.5">
                {viralJson.spoken_lines.map((line, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="font-mono text-muted-foreground shrink-0 w-20">{line.start}s – {line.end}s</span>
                    <span className="text-foreground">"{line.text}"</span>
                    {line.emotion && <Badge variant="outline" className="text-[10px]">{line.emotion}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scene Timeline */}
          {viralJson.scenes && viralJson.scenes.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <button onClick={() => setShowTimeline(!showTimeline)} className="flex items-center justify-between w-full">
                <h4 className="text-sm font-semibold text-foreground">📐 Timeline ({viralJson.scenes.length} escenas)</h4>
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
                        {scene.dialogue && <p className="text-muted-foreground italic">"{scene.dialogue}"</p>}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {scene.camera_shot && <span className="text-muted-foreground">📷 {scene.camera_shot}</span>}
                          {scene.emotion && <span className="text-muted-foreground">😊 {scene.emotion}</span>}
                          {scene.body_posture && <span className="text-muted-foreground">🧍 {scene.body_posture}</span>}
                          {scene.product_visible && <span className="text-primary">📦 Producto visible</span>}
                        </div>
                        {scene.micro_actions && scene.micro_actions.length > 0 && (
                          <p className="text-muted-foreground text-[11px]">Micro: {scene.micro_actions.join(" · ")}</p>
                        )}
                        {scene.continuity_note && (
                          <p className="text-muted-foreground text-[11px]">↪ {scene.continuity_note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* B) Export Buttons */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">📤 Exportar JSON</h4>
            <div className="flex flex-wrap gap-2">
              <CopyBtn label="JSON" onClick={copyFullJson} />
              <CopyBtn label="Sora" onClick={copySoraPrompt} disabled={!viralJson.sora_prompt} />
              <CopyBtn label="Higgsfield" onClick={copyHiggsfield} disabled={!viralJson.higgsfield_prompt} />
              <Button onClick={downloadJson} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download .json
              </Button>
            </div>
          </div>

          {/* C) Reference Image */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Imagen de referencia
            </h4>
            {referenceImageUrl ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Usa esta imagen como referencia principal al pegar el JSON en la plataforma externa.
                </p>
                <div className="relative w-full max-w-xs mx-auto">
                  <img src={referenceImageUrl} alt="Reference frame" className="rounded-lg border border-border w-full" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => copyText(referenceImageUrl, "ImageURL")} variant="outline" size="sm" className="gap-1.5">
                    {copied === "ImageURL" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy URL
                  </Button>
                  <Button onClick={() => { const a = document.createElement("a"); a.href = referenceImageUrl; a.download = `reference-${Date.now()}.png`; a.target = "_blank"; a.click(); }} variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  <Button onClick={() => window.open(referenceImageUrl, "_blank")} variant="outline" size="sm" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </Button>
                  <Button onClick={() => viralJson && generateReferenceImage(viralJson)} variant="outline" size="sm" className="gap-1.5" disabled={generatingImage}>
                    {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Regenerar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">No se generó imagen de referencia.</p>
                <Button onClick={() => viralJson && generateReferenceImage(viralJson)} variant="outline" size="sm" className="gap-1.5" disabled={generatingImage}>
                  {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  Generar ahora
                </Button>
              </div>
            )}
          </div>

          {/* Full JSON Viewer */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <button onClick={() => setShowFullJson(!showFullJson)} className="flex items-center justify-between w-full">
              <h4 className="text-sm font-semibold text-foreground">🧬 JSON Completo</h4>
              {showFullJson ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showFullJson && (
              <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] text-foreground whitespace-pre-wrap">
                {JSON.stringify(viralJson, null, 2)}
              </pre>
            )}
          </div>

          {/* Diagnostics */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-2">
            <button onClick={() => setShowDiagnostics(!showDiagnostics)} className="flex items-center justify-between w-full text-sm">
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
                  <span className="text-muted-foreground uppercase text-[10px] font-medium">Plataforma</span>
                  <p className="text-foreground">{viralJson.target_platform || "—"}</p>
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
                {viralJson.continuity_rules && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground uppercase text-[10px] font-medium">Reglas de continuidad</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {viralJson.continuity_rules.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>
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
