import { useState, useCallback, useRef } from "react";
import {
  Loader2, Copy, Check, RotateCcw, AlertCircle, Download,
  ChevronDown, ChevronUp, Sparkles, Plus, Trash2, Image as ImageIcon,
  FileText, Eye, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ImageUploadField from "@/components/shared/ImageUploadField";
import ExecutionTimeline from "@/components/debug/ExecutionTimeline";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";

/* ── Types ── */
interface VideoAnalysis {
  video_url: string;
  hook_type: string;
  hook_text?: string;
  narrative_structure: string;
  creator_archetype?: string;
  voice_delivery?: string;
  cta_text?: string;
  cta_style?: string;
  editing_rhythm?: string;
  shot_types?: string[];
  product_integration?: string;
  claims?: string[];
  emotional_tone?: string;
  energy_level?: string;
  estimated_duration?: number;
  winning_elements: string[];
}

interface WinningPatterns {
  hook_patterns: string[];
  script_patterns: string[];
  cta_patterns: string[];
  visual_patterns?: string[];
  creator_archetypes?: string[];
  product_integration_patterns?: string[];
  emotional_patterns?: string[];
  winning_structure_summary: string;
  recommended_duration_seconds?: number;
}

interface Script {
  title: string;
  angle: string;
  hook: string;
  full_script: string;
  cta: string;
  performance_notes?: string;
  estimated_duration_seconds: number;
  delivery_style: string;
  based_on_pattern?: string;
}

interface ImageHints {
  recommended_poses?: string[];
  recommended_environments?: string[];
  recommended_expressions?: string[];
  product_visibility_style?: string;
  creator_look_description?: string;
  dominant_shot_type?: string;
}

interface AigenResult {
  video_analyses: VideoAnalysis[];
  winning_patterns: WinningPatterns;
  scripts: Script[];
  image_generation_hints: ImageHints;
}

type AigenStep = "input" | "analyzing" | "generating_images" | "results";

/* ── Component ── */
const AigenPage = () => {
  const { user } = useAuth();

  // Flow
  const [step, setStep] = useState<AigenStep>("input");
  const [error, setError] = useState<string | null>(null);
  const jobIdRef = useRef(`aigen_${Date.now()}`);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Inputs
  const [videoUrls, setVideoUrls] = useState<string[]>([""]);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [imageCount, setImageCount] = useState("3");
  const [scriptCount, setScriptCount] = useState("5");
  const [language, setLanguage] = useState("es-MX");

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scriptStyle, setScriptStyle] = useState("");
  const [ctaStyle, setCtaStyle] = useState("");
  const [actorDiversity, setActorDiversity] = useState(true);

  // Results
  const [result, setResult] = useState<AigenResult | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /* ── URL management ── */
  const addUrl = () => { if (videoUrls.length < 3) setVideoUrls([...videoUrls, ""]); };
  const removeUrl = (i: number) => { if (videoUrls.length > 1) setVideoUrls(videoUrls.filter((_, idx) => idx !== i)); };
  const updateUrl = (i: number, val: string) => { const u = [...videoUrls]; u[i] = val; setVideoUrls(u); };

  /* ── Copy ── */
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error("Error al copiar"); }
  }, []);

  const copyAllScripts = useCallback(() => {
    if (!result?.scripts) return;
    const all = result.scripts.map((s, i) =>
      `--- Guión ${i + 1}: ${s.title} ---\nÁngulo: ${s.angle}\nDelivery: ${s.delivery_style}\nDuración: ~${s.estimated_duration_seconds}s\n\n${s.full_script}\n`
    ).join("\n\n");
    copyText(all, "Todos los guiones");
  }, [result, copyText]);

  /* ── Generate images sequentially ── */
  const generateImages = useCallback(async (hints: ImageHints) => {
    const count = parseInt(imageCount) || 3;
    setStep("generating_images");
    const images: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        toast.info(`Generando imagen ${i + 1} de ${count}...`);
        const { data, error: fnErr } = await supabase.functions.invoke("generate-aigen-images", {
          body: {
            job_id: jobIdRef.current,
            product_image_url: productImageUrl,
            image_hints: hints,
            image_index: i,
            actor_diversity: actorDiversity,
          },
        });
        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) throw new Error(data.error);
        if (data?.image_url) images.push(data.image_url);
      } catch (err: any) {
        console.error(`Image ${i + 1} error:`, err);
        toast.error(`Error en imagen ${i + 1}: ${err.message}`);
      }
    }

    setGeneratedImages(images);
    if (images.length > 0) toast.success(`${images.length} imagen(es) generada(s)`);
    setStep("results");
  }, [imageCount, productImageUrl, actorDiversity]);

  /* ── Main action ── */
  const handleGenerate = useCallback(async () => {
    const urls = videoUrls.filter(u => u.trim());
    if (urls.length === 0) { toast.error("Ingresa al menos 1 URL de video"); return; }
    if (!productImageUrl) { toast.error("Sube la imagen del producto"); return; }

    setStep("analyzing");
    setError(null);
    setResult(null);
    setGeneratedImages([]);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "aigen",
        title: `Aigen — ${urls.length} video(s)`,
        status: "running", current_step: "analyzing",
        source_route: "/create/aigen",
        input_summary_json: { video_urls: urls, product_image_url: productImageUrl, notes, image_count: imageCount, script_count: scriptCount },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-aigen-videos", {
        body: {
          video_urls: urls,
          product_image_url: productImageUrl,
          notes: notes || undefined,
          language,
          script_count: parseInt(scriptCount) || 5,
          script_style: scriptStyle || undefined,
          cta_style: ctaStyle || undefined,
          realism_mode: "maximum",
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      const aigenResult = data as AigenResult;
      setResult(aigenResult);
      toast.success(`Análisis completo: ${aigenResult.scripts?.length || 0} guiones generados`);

      // Generate images
      if (parseInt(imageCount) > 0 && productImageUrl) {
        await generateImages(aigenResult.image_generation_hints || {});
      } else {
        setStep("results");
      }

      await updateHistoryRecord(jobId, {
        status: "completed", current_step: "results",
        output_summary_json: {
          scripts_count: aigenResult.scripts?.length || 0,
          images_count: generatedImages.length,
          videos_analyzed: aigenResult.video_analyses?.length || 0,
        },
      });
    } catch (err: any) {
      console.error("Aigen error:", err);
      setError(err.message || "Error en el análisis");
      setStep("input");
      toast.error("Error en Aigen");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message });
    }
  }, [videoUrls, productImageUrl, notes, user, language, scriptCount, imageCount, scriptStyle, ctaStyle, generateImages, generatedImages.length]);

  const reset = useCallback(() => {
    setStep("input"); setResult(null); setGeneratedImages([]); setError(null);
    jobIdRef.current = `aigen_${Date.now()}`;
  }, []);

  /* ── Regenerate single image ── */
  const regenerateImage = useCallback(async (index: number) => {
    if (!result?.image_generation_hints) return;
    toast.info(`Regenerando imagen ${index + 1}...`);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-aigen-images", {
        body: {
          job_id: jobIdRef.current,
          product_image_url: productImageUrl,
          image_hints: result.image_generation_hints,
          image_index: index,
          actor_diversity: actorDiversity,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      if (data?.image_url) {
        setGeneratedImages(prev => {
          const updated = [...prev];
          updated[index] = data.image_url;
          return updated;
        });
        toast.success(`Imagen ${index + 1} regenerada`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }, [result, productImageUrl, actorDiversity]);

  /* ── RENDER ── */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Aigen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza videos ganadores de TikTok Shop → genera imágenes UGC base + guiones listos para HeyGen.
        </p>
      </div>

      {/* ── INPUT ── */}
      {step === "input" && !result && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          {/* Video URLs */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Videos ganadores de Calodata / TikTok Shop *</Label>
            {videoUrls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={url}
                  onChange={e => updateUrl(i, e.target.value)}
                  placeholder={`https://www.tiktok.com/@creator/video/... (Video ${i + 1})`}
                  className="flex-1"
                />
                {videoUrls.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeUrl(i)} className="shrink-0 h-10 w-10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {videoUrls.length < 3 && (
              <Button variant="outline" size="sm" onClick={addUrl} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar video
              </Button>
            )}
          </div>

          {/* Product image + notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploadField label="Imagen del producto" value={productImageUrl} onChange={setProductImageUrl} required prefix="aigen_product" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notas (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto del producto, mercado, público objetivo..." rows={3} />
            </div>
          </div>

          {/* Quick options */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Imágenes base</Label>
              <Select value={imageCount} onValueChange={setImageCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n} imagen{n > 1 ? "es" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Guiones</Label>
              <Select value={scriptCount} onValueChange={setScriptCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n} guión{n > 1 ? "es" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="es-MX">Español (MX)</SelectItem>
                  <SelectItem value="es-US">Español (US)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Switch id="diversity" checked={actorDiversity} onCheckedChange={setActorDiversity} />
                <Label htmlFor="diversity" className="text-sm cursor-pointer">Diversidad de actores</Label>
              </div>
            </div>
          </div>

          {/* Advanced */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Opciones avanzadas
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 rounded-lg p-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Estilo de guión</Label>
                  <Input value={scriptStyle} onChange={e => setScriptStyle(e.target.value)} placeholder="ej: testimonial, urgente, educativo..." />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Estilo de CTA</Label>
                  <Input value={ctaStyle} onChange={e => setCtaStyle(e.target.value)} placeholder="ej: carrito naranja, link en bio, comenta..." />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button onClick={handleGenerate} className="w-full gradient-cta text-white border-0" size="lg">
            <Sparkles className="mr-2 h-4 w-4" /> Generar imágenes y guiones
          </Button>
        </div>
      )}

      {/* ── LOADING ── */}
      {(step === "analyzing" || step === "generating_images") && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {step === "analyzing" ? "Analizando videos y generando guiones..." : "Generando imágenes UGC base..."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {step === "analyzing" ? "Extrayendo patrones ganadores de los videos" : "Creando imágenes hiperrealistas con product lock"}
            </p>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === "results" && result && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Nuevo análisis
            </Button>
            <Button onClick={copyAllScripts} variant="outline" size="sm" className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar todos los guiones
            </Button>
            <Badge variant="secondary" className="text-xs">
              {result.scripts?.length || 0} guiones · {generatedImages.length} imágenes · {result.video_analyses?.length || 0} videos
            </Badge>
          </div>

          {/* A) Insights */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Patrones Ganadores</h2>
            </div>
            <p className="text-sm text-muted-foreground">{result.winning_patterns?.winning_structure_summary}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {result.winning_patterns?.hook_patterns?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hooks</span>
                  {result.winning_patterns.hook_patterns.map((h, i) => (
                    <p key={i} className="text-xs text-foreground">• {h}</p>
                  ))}
                </div>
              )}
              {result.winning_patterns?.cta_patterns?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CTAs</span>
                  {result.winning_patterns.cta_patterns.map((c, i) => (
                    <p key={i} className="text-xs text-foreground">• {c}</p>
                  ))}
                </div>
              )}
              {result.winning_patterns?.visual_patterns?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visual</span>
                  {result.winning_patterns.visual_patterns.map((v, i) => (
                    <p key={i} className="text-xs text-foreground">• {v}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* B) Scripts */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Guiones para HeyGen</h2>
            </div>
            <div className="space-y-3">
              {result.scripts?.map((script, i) => (
                <ScriptCard key={i} script={script} index={i} copyText={copyText} copied={copied} />
              ))}
            </div>
          </div>

          {/* C) Images */}
          {generatedImages.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Imágenes UGC Base</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {generatedImages.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border bg-muted">
                    <img src={url} alt={`UGC base ${i + 1}`} className="w-full aspect-[9/16] object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => copyText(url, `img-${i}`)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <a href={url} download target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="secondary" className="h-8 w-8">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => regenerateImage(i)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D) Diagnostics */}
          <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {showDiagnostics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Diagnóstico
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <ExecutionTimeline jobId={jobIdRef.current} refreshTrigger={refreshTrigger} />
              {result.video_analyses && (
                <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Análisis por video</span>
                  {result.video_analyses.map((va, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Video {i + 1}:</span> {va.hook_type} hook · {va.narrative_structure} · {va.winning_elements?.join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
};

/* ── Script card sub-component ── */
function ScriptCard({ script, index, copyText, copied }: {
  script: Script; index: number;
  copyText: (text: string, label: string) => void;
  copied: string | null;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const label = `script-${index}`;

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] shrink-0">{index + 1}</Badge>
            <span className="text-sm font-medium text-foreground">{script.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-[9px]">{script.angle}</Badge>
            <Badge variant="secondary" className="text-[9px]">{script.delivery_style}</Badge>
            <span className="text-[10px] text-muted-foreground">~{script.estimated_duration_seconds}s</span>
          </div>
        </button>
        <Button
          variant="ghost" size="sm" className="gap-1 text-xs shrink-0"
          onClick={() => copyText(script.full_script, label)}
        >
          {copied === label ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          Copiar
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Hook</span>
            <p className="text-xs text-foreground mt-0.5">"{script.hook}"</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Guión completo</span>
            <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap bg-muted/30 rounded p-2">{script.full_script}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CTA</span>
            <p className="text-xs text-foreground mt-0.5">"{script.cta}"</p>
          </div>
          {script.performance_notes && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notas de performance</span>
              <p className="text-xs text-muted-foreground mt-0.5">{script.performance_notes}</p>
            </div>
          )}
          {script.based_on_pattern && (
            <p className="text-[10px] text-muted-foreground italic">Basado en: {script.based_on_pattern}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default AigenPage;
