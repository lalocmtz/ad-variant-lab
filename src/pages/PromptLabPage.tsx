import { useState, useCallback, useRef } from "react";
import {
  Loader2, Copy, Check, RotateCcw, AlertCircle, Download,
  ChevronDown, ChevronUp, Zap, Clock, Film, Eye, Image as ImageIcon,
  ExternalLink, RefreshCw, FileJson, FileText, ClipboardList, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ImageUploadField from "@/components/shared/ImageUploadField";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";
import { buildReferenceImagePrompt, resolveVars, REFERENCE_IMAGE_REALISM_MODE, type ReferenceImageVars } from "@/lib/referenceImagePrompt";

/* ══════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════ */

type LabMode = "reverse" | "export_json" | "external_instructions";

// ── Reverse Engineer types (existing) ──
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

// ── External Instructions types (new) ──
interface ExternalResult {
  animation_json: Record<string, unknown>;
  video_prompt: string;
  execution_blueprint: Record<string, unknown>;
}

type LabStep = "input" | "analyzing" | "generating_image" | "results";

/* ══════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════ */
const PromptLabPage = () => {
  const { user } = useAuth();

  // Mode
  const [mode, setMode] = useState<LabMode>("reverse");

  // Flow state
  const [step, setStep] = useState<LabStep>("input");
  const [error, setError] = useState<string | null>(null);
  const jobIdRef = useRef(`vjson_${Date.now()}`);

  // ── Reverse Engineer inputs ──
  const [videoUrl, setVideoUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [generateRefImage, setGenerateRefImage] = useState(false);

  // ── External Instructions inputs ──
  const [extRefImageUrl, setExtRefImageUrl] = useState("");
  const [extProductImageUrl, setExtProductImageUrl] = useState("");
  const [extContext, setExtContext] = useState("");
  const [extScript, setExtScript] = useState("");
  const [extCreativeType, setExtCreativeType] = useState("recomendación");
  const [extEnergy, setExtEnergy] = useState("casual");
  const [extDelivery, setExtDelivery] = useState("casual");
  const [extCamera, setExtCamera] = useState("selfie");
  const [extOverlay, setExtOverlay] = useState("none");
  const [extGraphics, setExtGraphics] = useState("none");
  const [extRealism, setExtRealism] = useState("maximum");

  // Shared options
  const [targetPlatform, setTargetPlatform] = useState("higgsfield");
  const [language, setLanguage] = useState("es-MX");
  const [targetDuration, setTargetDuration] = useState("15");
  const [variationLevel, setVariationLevel] = useState("moderate");
  const [productLock, setProductLock] = useState(true);
  const [languageLock, setLanguageLock] = useState(true);
  const [realismLevel, setRealismLevel] = useState("maximum");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Results — reverse
  const [viralJson, setViralJson] = useState<ViralJSON | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Results — external
  const [extResult, setExtResult] = useState<ExternalResult | null>(null);

  // UI
  const [copied, setCopied] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showFullJson, setShowFullJson] = useState(false);
  const [showExtVideoPrompt, setShowExtVideoPrompt] = useState(false);
  const [showExtBlueprint, setShowExtBlueprint] = useState(false);
  const [showExtJson, setShowExtJson] = useState(false);

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

  const downloadJson = useCallback((json: Record<string, unknown>, prefix: string) => {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${prefix}-${targetPlatform}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON descargado");
  }, [targetPlatform]);

  /* ── Generate Reference Image ── */
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
      const resolved = resolveVars(vars);
      const { data, error: fnErr } = await supabase.functions.invoke("generate-prompt-lab-reference-image", {
        body: {
          job_id: jobIdRef.current, source_video_url: videoUrl,
          product_image_url: productImageUrl || undefined,
          hook_frame_description: resolved.source_hook_summary,
          actor_description: resolved.actor_description || undefined,
          style_description: resolved.style_description || undefined,
          body_target: resolved.body_target, environment_hint: resolved.environment_hint,
          product_visibility_mode: resolved.product_visibility_mode,
          context_variation_level: resolved.context_variation_level,
          language_market_hint: resolved.language_market_hint,
          variation_policy: json.variation_policy, target_platform: targetPlatform,
          language, realism_level: REFERENCE_IMAGE_REALISM_MODE,
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
  }, [videoUrl, productImageUrl, targetPlatform, language, variationLevel]);

  /* ── Analyze Video (Reverse Engineer mode) ── */
  const analyzeVideo = useCallback(async () => {
    if (!videoUrl.trim()) { toast.error("Ingresa una URL de video"); return; }
    setStep("analyzing"); setError(null); setViralJson(null); setReferenceImageUrl(null);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "prompt_lab",
        title: `Viral JSON — ${videoUrl.substring(0, 60)}`,
        status: "running", current_step: "analyzing", source_route: "/create/prompt-lab",
        input_summary_json: { video_url: videoUrl, product_image_url: productImageUrl, notes, target_platform: targetPlatform, generate_ref_image: generateRefImage },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-viral-structure", {
        body: {
          video_url: videoUrl.trim(), product_image_url: productImageUrl || undefined,
          notes: notes || undefined, target_duration: parseInt(targetDuration) || 12,
          language, target_platform: targetPlatform, product_lock_enabled: productLock,
          language_lock_enabled: languageLock, realism_level: realismLevel, variation_level: variationLevel,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      const json = data as ViralJSON;
      setViralJson(json);
      if (generateRefImage) { await generateReferenceImage(json); } else { setStep("results"); }

      await updateHistoryRecord(jobId, {
        status: "completed", current_step: "results",
        output_summary_json: {
          video_type: json.video_type, scenes: json.scenes?.length || 0,
          compressed_to: json.compressed_duration_seconds, platform: json.target_platform,
          ref_image_generated: generateRefImage,
        },
      });
    } catch (err: any) {
      console.error("Viral JSON analysis error:", err);
      setError(err.message || "Error al analizar video"); setStep("input");
      toast.error("Error en el análisis");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message, current_step: "analyzing" });
    }
  }, [videoUrl, productImageUrl, notes, user, targetDuration, language, targetPlatform, productLock, languageLock, realismLevel, variationLevel, generateRefImage, generateReferenceImage]);

  /* ── Compose External Instructions (new mode) ── */
  const composeExternal = useCallback(async () => {
    if (!extRefImageUrl.trim()) { toast.error("Sube una imagen de referencia"); return; }
    if (!extScript.trim()) { toast.error("Pega un guion"); return; }
    setStep("analyzing"); setError(null); setExtResult(null);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "prompt_lab_external",
        title: `External ${targetPlatform} — ${extScript.substring(0, 50)}`,
        status: "running", current_step: "composing", source_route: "/create/prompt-lab",
        input_summary_json: { mode: "external_instructions", target_platform: targetPlatform, has_product: !!extProductImageUrl, duration: targetDuration },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("compose-external-video", {
        body: {
          reference_image_url: extRefImageUrl,
          product_image_url: extProductImageUrl || undefined,
          context: extContext || undefined,
          script: extScript,
          target_platform: targetPlatform,
          duration: parseInt(targetDuration) || 15,
          language, accent: language === "es-MX" ? "mexicano" : language === "pt-BR" ? "brasileño" : "neutral",
          creative_type: extCreativeType, energy: extEnergy, delivery: extDelivery,
          camera_style: extCamera, overlay_policy: extOverlay, graphics_policy: extGraphics,
          realism: extRealism, product_lock: productLock, language_lock: languageLock,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setExtResult(data as ExternalResult);
      setStep("results");
      toast.success("Instrucciones generadas");

      await updateHistoryRecord(jobId, {
        status: "completed", current_step: "results",
        output_summary_json: { platform: targetPlatform, has_json: !!data.animation_json, has_prompt: !!data.video_prompt, has_blueprint: !!data.execution_blueprint },
      });
    } catch (err: any) {
      console.error("External compose error:", err);
      setError(err.message || "Error al componer instrucciones"); setStep("input");
      toast.error("Error generando instrucciones");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message, current_step: "composing" });
    }
  }, [extRefImageUrl, extProductImageUrl, extContext, extScript, targetPlatform, targetDuration, language, extCreativeType, extEnergy, extDelivery, extCamera, extOverlay, extGraphics, extRealism, productLock, languageLock, user]);

  const reset = useCallback(() => {
    setStep("input"); setViralJson(null); setReferenceImageUrl(null); setExtResult(null);
    setError(null); setGeneratingImage(false);
    jobIdRef.current = `vjson_${Date.now()}`;
  }, []);

  const CopyBtn = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <Button onClick={onClick} variant={label === "JSON" ? "default" : "outline"} size="sm" className="gap-1.5" disabled={disabled}>
      {copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied === label ? "Copiado" : label}
    </Button>
  );

  const isReverse = mode === "reverse" || mode === "export_json";
  const isExternal = mode === "external_instructions";

  /* ══════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════ */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prompt Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reverse-engineer videos o genera instrucciones de animación para Sora / Higgsfield.
        </p>
      </div>

      {/* Mode selector */}
      <Tabs value={mode} onValueChange={(v) => { setMode(v as LabMode); reset(); }}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reverse" className="gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" /> Reverse Engineer
          </TabsTrigger>
          <TabsTrigger value="export_json" className="gap-1.5 text-xs">
            <FileJson className="h-3.5 w-3.5" /> Export JSON
          </TabsTrigger>
          <TabsTrigger value="external_instructions" className="gap-1.5 text-xs">
            <Send className="h-3.5 w-3.5" /> External Instructions
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ═══════════════════ INPUT ═══════════════════ */}
      {step === "input" && (
        <>
          {/* ── REVERSE / EXPORT JSON (existing flow) ── */}
          {isReverse && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
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
                    <Label className="text-xs font-medium text-muted-foreground">Nivel de variación</Label>
                    <Select value={variationLevel} onValueChange={setVariationLevel}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Mínima</SelectItem>
                        <SelectItem value="moderate">Moderada</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Nivel de realismo</Label>
                    <Select value={realismLevel} onValueChange={setRealismLevel}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="maximum">Máximo</SelectItem>
                        <SelectItem value="balanced">Balanceado</SelectItem>
                        <SelectItem value="polished">Pulido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}

              <Button onClick={analyzeVideo} disabled={!videoUrl.trim()} size="lg" className="gap-2">
                <Zap className="h-4 w-4" />
                Analizar y generar {generateRefImage ? "JSON + Imagen" : "JSON"}
              </Button>
            </div>
          )}

          {/* ── EXTERNAL INSTRUCTIONS (new flow) ── */}
          {isExternal && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs text-primary font-medium">📤 Modo Export: Genera instrucciones listas para pegar en Sora / Higgsfield.</p>
                <p className="text-xs text-muted-foreground mt-1">Sube una imagen de referencia + pega un guion → obtén JSON, Video Prompt y Blueprint.</p>
              </div>

              {/* Reference image + Product image */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUploadField label="Imagen de referencia (actor/anchor) *" value={extRefImageUrl} onChange={setExtRefImageUrl} prefix="ext_ref" />
                <ImageUploadField label="Imagen del producto (opcional)" value={extProductImageUrl} onChange={setExtProductImageUrl} prefix="ext_product" compact />
              </div>

              {/* Context */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Contexto / Brief (opcional)</Label>
                <Input value={extContext} onChange={e => setExtContext(e.target.value)} placeholder="Video UGC de recomendación de skincare para TikTok Shop México" />
              </div>

              {/* Script */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Guion / Spoken Script *</Label>
                <Textarea value={extScript} onChange={e => setExtScript(e.target.value)} placeholder={`Formato libre o estructurado:\n\nHOOK (0-2.5s): ¿Sabías que tu piel...\nBODY (2.5-10.5s): Este sérum tiene...\nCTA (10.5-15s): ¡Cómpralo ahora!`} rows={6} className="font-mono text-xs" />
                <p className="text-[11px] text-muted-foreground">Pega tu guion completo. Si incluyes marcadores HOOK/BODY/CTA con tiempos, se respetarán.</p>
              </div>

              {/* Quick options */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Plataforma</Label>
                  <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="higgsfield">Higgsfield</SelectItem>
                      <SelectItem value="sora">Sora</SelectItem>
                      <SelectItem value="generic">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Duración</Label>
                  <Select value={targetDuration} onValueChange={setTargetDuration}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8s</SelectItem>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="12">12s</SelectItem>
                      <SelectItem value="15">15s</SelectItem>
                      <SelectItem value="20">20s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Idioma</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es-MX">Español MX</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                      <SelectItem value="pt-BR">Português</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tipo de creativo</Label>
                  <Select value={extCreativeType} onValueChange={setExtCreativeType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recomendación">Recomendación</SelectItem>
                      <SelectItem value="testimonio">Testimonio</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                      <SelectItem value="problema-solución">Problema → Solución</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Semantic controls row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Energía</Label>
                  <Select value={extEnergy} onValueChange={setExtEnergy}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="energético">Energético</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="confiable">Confiable</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Delivery</Label>
                  <Select value={extDelivery} onValueChange={setExtDelivery}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="energético">Energético</SelectItem>
                      <SelectItem value="confiable">Confiable</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Cámara</Label>
                  <Select value={extCamera} onValueChange={setExtCamera}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="selfie">Selfie</SelectItem>
                      <SelectItem value="static_pov">Static POV</SelectItem>
                      <SelectItem value="handheld">Handheld</SelectItem>
                      <SelectItem value="medium_shot">Medium shot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Realismo</Label>
                  <Select value={extRealism} onValueChange={setExtRealism}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maximum">Máximo</SelectItem>
                      <SelectItem value="balanced">Balanceado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Overlay / Graphics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Overlays</Label>
                  <Select value={extOverlay} onValueChange={setExtOverlay}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno</SelectItem>
                      <SelectItem value="captions">Captions</SelectItem>
                      <SelectItem value="native_subtitles">Subtítulos nativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Gráficos</Label>
                  <Select value={extGraphics} onValueChange={setExtGraphics}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno</SelectItem>
                      <SelectItem value="minimal">Mínimos</SelectItem>
                      <SelectItem value="cta_only">Solo CTA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Switch id="ext-prod-lock" checked={productLock} onCheckedChange={setProductLock} />
                  <Label htmlFor="ext-prod-lock" className="text-xs cursor-pointer">Product Lock</Label>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Switch id="ext-lang-lock" checked={languageLock} onCheckedChange={setLanguageLock} />
                  <Label htmlFor="ext-lang-lock" className="text-xs cursor-pointer">Language Lock</Label>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}

              <Button onClick={composeExternal} disabled={!extRefImageUrl.trim() || !extScript.trim()} size="lg" className="gap-2">
                <Send className="h-4 w-4" />
                Generar instrucciones para {targetPlatform}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ LOADING ═══════════════════ */}
      {step === "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">
              {isExternal ? "Componiendo instrucciones de animación..." : "Analizando estructura viral..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {isExternal ? "Generando JSON, Video Prompt y Blueprint." : "Extrayendo timeline, escenas, hook, CTA, ritmo y diálogo."}
            </p>
          </div>
        </div>
      )}

      {step === "generating_image" && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Generando imagen de referencia...</p>
            <p className="text-xs text-muted-foreground">Creando anchor frame hiperrealista.</p>
          </div>
        </div>
      )}

      {/* ═══════════════════ RESULTS — REVERSE ENGINEER ═══════════════════ */}
      {step === "results" && isReverse && viralJson && (
        <div className="space-y-5">
          {/* Diagnostics Bar */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">📊 Diagnóstico del video</h4>
            <div className="flex flex-wrap items-center gap-2">
              {viralJson.video_type && <Badge variant="secondary" className="text-xs">{viralJson.video_type}</Badge>}
              {viralJson.target_platform && <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{viralJson.target_platform.toUpperCase()}</Badge>}
              {viralJson.original_duration_seconds && <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" /> Original: {viralJson.original_duration_seconds}s</Badge>}
              {viralJson.compressed_duration_seconds && <Badge variant="outline" className="text-xs gap-1"><Film className="h-3 w-3" /> Comprimido: {viralJson.compressed_duration_seconds}s</Badge>}
              {viralJson.scenes && <Badge variant="outline" className="text-xs gap-1"><Eye className="h-3 w-3" /> {viralJson.scenes.length} escenas</Badge>}
              {viralJson.viral_structure?.hook_type && <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Hook: {viralJson.viral_structure.hook_type}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {viralJson.language_lock && <span className="text-muted-foreground">🔒 Language: {(viralJson.language_lock as any).language || "—"}</span>}
              {viralJson.product_lock && <span className="text-muted-foreground">🔒 Product: {(viralJson.product_lock as any).enabled ? "ON" : "OFF"}</span>}
            </div>
          </div>

          {/* Winning Elements */}
          {viralJson.viral_structure?.winning_elements && viralJson.viral_structure.winning_elements.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">🏆 Winning Elements</h4>
              <div className="flex flex-wrap gap-1.5">
                {viralJson.viral_structure.winning_elements.map((el, i) => <Badge key={i} variant="outline" className="text-xs">{el}</Badge>)}
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
                          {scene.product_visible && <span className="text-primary">📦 Producto visible</span>}
                        </div>
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
              <CopyBtn label="Copy JSON" onClick={copyFullJson} />
              <CopyBtn label="Export Sora" onClick={copySoraPrompt} disabled={!viralJson.sora_prompt} />
              <CopyBtn label="Export Higgsfield" onClick={copyHiggsfield} disabled={!viralJson.higgsfield_prompt} />
              <Button onClick={() => downloadJson(viralJson, "viral-blueprint")} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download .json
              </Button>
            </div>
          </div>

          {/* Reference Image */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Imagen de referencia
            </h4>
            {referenceImageUrl ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Usa esta imagen como referencia principal al pegar el JSON en la plataforma externa.</p>
                <div className="relative w-full max-w-xs mx-auto">
                  <img src={referenceImageUrl} alt="Reference frame" className="rounded-lg border border-border w-full" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyBtn label="Copy URL" onClick={() => copyText(referenceImageUrl, "Copy URL")} />
                  <Button onClick={() => { const a = document.createElement("a"); a.href = referenceImageUrl; a.download = `reference-${Date.now()}.png`; a.target = "_blank"; a.click(); }} variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Download</Button>
                  <Button onClick={() => viralJson && generateReferenceImage(viralJson)} variant="outline" size="sm" className="gap-1.5" disabled={generatingImage}>
                    {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">No se generó imagen de referencia.</p>
                <Button onClick={() => viralJson && generateReferenceImage(viralJson)} variant="outline" size="sm" className="gap-1.5" disabled={generatingImage}>
                  {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Generar ahora
                </Button>
              </div>
            )}
          </div>

          {/* Full JSON */}
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
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Original</span><p className="text-foreground">{viralJson.original_duration_seconds || "—"}s</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Comprimido</span><p className="text-foreground">{viralJson.compressed_duration_seconds || "—"}s</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Escenas</span><p className="text-foreground">{viralJson.scenes?.length || 0}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Plataforma</span><p className="text-foreground">{viralJson.target_platform || "—"}</p></div>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Nuevo análisis</Button>
        </div>
      )}

      {/* ═══════════════════ RESULTS — EXTERNAL INSTRUCTIONS ═══════════════════ */}
      {step === "results" && isExternal && extResult && (
        <div className="space-y-5">
          {/* Status bar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{targetPlatform.toUpperCase()}</Badge>
              <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" /> {targetDuration}s</Badge>
              <Badge variant="outline" className="text-xs">🔒 {language}</Badge>
              {productLock && <Badge variant="outline" className="text-xs">📦 Product Lock</Badge>}
              {languageLock && <Badge variant="outline" className="text-xs">🌐 Language Lock</Badge>}
              <Badge variant="secondary" className="text-xs">{extCreativeType}</Badge>
              <Badge variant="secondary" className="text-xs">{extCamera}</Badge>
            </div>
          </div>

          {/* A) Animation JSON */}
          {extResult.animation_json && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileJson className="h-4 w-4 text-primary" /> Animation JSON
                </h4>
                <div className="flex gap-2">
                  <CopyBtn label="Copy JSON" onClick={() => copyText(JSON.stringify(extResult.animation_json, null, 2), "Copy JSON")} />
                  <Button onClick={() => downloadJson(extResult.animation_json, "animation")} variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
              <button onClick={() => setShowExtJson(!showExtJson)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {showExtJson ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showExtJson ? "Ocultar" : "Ver"} JSON completo
              </button>
              {showExtJson && (
                <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] text-foreground whitespace-pre-wrap">
                  {JSON.stringify(extResult.animation_json, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* B) Video Prompt */}
          {extResult.video_prompt && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Video Prompt
                </h4>
                <CopyBtn label="Copy Prompt" onClick={() => copyText(extResult.video_prompt, "Copy Prompt")} />
              </div>
              <button onClick={() => setShowExtVideoPrompt(!showExtVideoPrompt)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {showExtVideoPrompt ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showExtVideoPrompt ? "Ocultar" : "Ver"} prompt completo
              </button>
              {showExtVideoPrompt && (
                <div className="bg-muted/50 rounded-lg p-4 text-xs overflow-auto max-h-[400px] text-foreground whitespace-pre-wrap">
                  {extResult.video_prompt}
                </div>
              )}
            </div>
          )}

          {/* C) Execution Blueprint */}
          {extResult.execution_blueprint && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Execution Blueprint
                </h4>
                <CopyBtn label="Copy Blueprint" onClick={() => copyText(JSON.stringify(extResult.execution_blueprint, null, 2), "Copy Blueprint")} />
              </div>
              <button onClick={() => setShowExtBlueprint(!showExtBlueprint)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {showExtBlueprint ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showExtBlueprint ? "Ocultar" : "Ver"} blueprint
              </button>
              {showExtBlueprint && (
                <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[400px] text-foreground whitespace-pre-wrap">
                  {JSON.stringify(extResult.execution_blueprint, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* D) Reference image preview */}
          {extRefImageUrl && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Imagen de referencia (anchor frame)
              </h4>
              <p className="text-xs text-muted-foreground">
                Usa esta imagen como referencia principal al pegar las instrucciones en {targetPlatform}.
              </p>
              <div className="relative w-full max-w-xs mx-auto">
                <img src={extRefImageUrl} alt="Reference" className="rounded-lg border border-border w-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyBtn label="Copy Image URL" onClick={() => copyText(extRefImageUrl, "Copy Image URL")} />
                <Button onClick={() => { const a = document.createElement("a"); a.href = extRefImageUrl; a.download = `reference-${Date.now()}.png`; a.target = "_blank"; a.click(); }} variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
          )}

          {/* E) Diagnostics */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-2">
            <button onClick={() => setShowDiagnostics(!showDiagnostics)} className="flex items-center justify-between w-full text-sm">
              <span className="font-medium text-muted-foreground">🔍 Diagnósticos</span>
              {showDiagnostics ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showDiagnostics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Plataforma</span><p className="text-foreground">{targetPlatform}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Duración</span><p className="text-foreground">{targetDuration}s</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Language Lock</span><p className="text-foreground">{languageLock ? `ON (${language})` : "OFF"}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Product Lock</span><p className="text-foreground">{productLock ? "ON" : "OFF"}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Creativo</span><p className="text-foreground">{extCreativeType}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Cámara</span><p className="text-foreground">{extCamera}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Energía</span><p className="text-foreground">{extEnergy}</p></div>
                <div><span className="text-muted-foreground uppercase text-[10px] font-medium">Overlays</span><p className="text-foreground">{extOverlay}</p></div>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Nuevas instrucciones</Button>
        </div>
      )}
    </div>
  );
};

export default PromptLabPage;
