import { useState, useCallback, useRef } from "react";
import {
  Loader2, Copy, Check, RotateCcw, AlertCircle, Download,
  ChevronDown, ChevronUp, Sparkles, Plus, Trash2,
  Play, Pause, Volume2, FileText, Eye, Upload, Music,
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
interface AudioRollScript {
  title: string;
  angle: string;
  hook: string;
  body: string;
  cta: string;
  full_script: string;
  estimated_duration_seconds: number;
  delivery_style: string;
  safe_version?: string;
  original_version?: string;
  safety_changes?: string[];
}

interface ReferenceAnalysis {
  video_url: string;
  hook_text?: string;
  narrative_structure?: string;
  tone?: string;
  cta_text?: string;
  claims?: string[];
  winning_elements?: string[];
}

interface WinningPatterns {
  hook_patterns: string[];
  script_patterns: string[];
  cta_patterns: string[];
  structure_summary: string;
  recommended_duration_seconds?: number;
}

interface AnalysisResult {
  reference_analyses: ReferenceAnalysis[];
  winning_patterns: WinningPatterns;
  scripts: AudioRollScript[];
}

type AudioRollStep = "input" | "analyzing" | "select_script" | "generating_voice" | "results";

/* ── Video Upload Field ── */
function VideoUploadField({ label, value, onChange, index }: {
  label: string; value: string; onChange: (url: string) => void; index: number;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Solo se permiten videos"); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error("El video debe ser menor a 100MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `audioroll_broll_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("videos").upload(fileName, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data } = supabase.storage.from("videos").getPublicUrl(fileName);
      onChange(data.publicUrl);
      toast.success(`${label} subido`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onChange, label, index]);

  return (
    <div className="relative">
      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-foreground/40 transition-colors bg-card overflow-hidden">
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value ? (
          <div className="flex flex-col items-center gap-1 text-primary">
            <Check className="h-5 w-5" /><span className="text-[10px]">Clip {index + 1} ✓</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Upload className="h-5 w-5" /><span className="text-[10px]">Clip {index + 1}</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center shadow-sm">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ── Main Component ── */
const AudioRollPage = () => {
  const { user } = useAuth();

  // Flow
  const [step, setStep] = useState<AudioRollStep>("input");
  const [error, setError] = useState<string | null>(null);
  const jobIdRef = useRef(`audioroll_${Date.now()}`);

  // Inputs
  const [refUrls, setRefUrls] = useState<string[]>([""]);
  const [brollClips, setBrollClips] = useState<string[]>(["", "", ""]);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [scriptCount, setScriptCount] = useState("5");
  const [language, setLanguage] = useState("es-MX");
  const [targetDuration, setTargetDuration] = useState("15");
  const [tiktokSafe, setTiktokSafe] = useState(true);

  // Voice
  const [voiceGender, setVoiceGender] = useState("female");
  const [voiceTone, setVoiceTone] = useState("natural");
  const [voicePace, setVoicePace] = useState("dynamic");

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Results
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedScriptIdx, setSelectedScriptIdx] = useState<number | null>(null);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /* ── URL management ── */
  const addUrl = () => { if (refUrls.length < 5) setRefUrls([...refUrls, ""]); };
  const removeUrl = (i: number) => { if (refUrls.length > 1) setRefUrls(refUrls.filter((_, idx) => idx !== i)); };
  const updateUrl = (i: number, val: string) => { const u = [...refUrls]; u[i] = val; setRefUrls(u); };

  /* ── B-roll management ── */
  const addBrollSlot = () => { if (brollClips.length < 10) setBrollClips([...brollClips, ""]); };
  const updateBroll = (i: number, url: string) => { const c = [...brollClips]; c[i] = url; setBrollClips(c); };
  const removeBroll = (i: number) => { if (brollClips.length > 1) setBrollClips(brollClips.filter((_, idx) => idx !== i)); };

  /* ── Copy ── */
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error("Error al copiar"); }
  }, []);

  /* ── Step 1: Analyze references + generate scripts ── */
  const handleAnalyze = useCallback(async () => {
    const urls = refUrls.filter(u => u.trim());
    if (urls.length === 0) { toast.error("Ingresa al menos 1 URL de referencia"); return; }
    const clips = brollClips.filter(c => c.trim());
    if (clips.length === 0) { toast.error("Sube al menos 1 clip de B-roll"); return; }

    setStep("analyzing");
    setError(null);
    setAnalysis(null);
    setSelectedScriptIdx(null);
    setVoiceAudioUrl(null);
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "audioroll",
        title: `AudioRoll — ${urls.length} ref(s), ${clips.length} clip(s)`,
        status: "running", current_step: "analyzing",
        source_route: "/create/audioroll",
        input_summary_json: {
          ref_urls: urls, broll_clips: clips, product_image_url: productImageUrl,
          notes, script_count: scriptCount, language, target_duration: targetDuration,
          voice: { gender: voiceGender, tone: voiceTone, pace: voicePace },
          tiktok_safe: tiktokSafe,
        },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-audioroll", {
        body: {
          video_urls: urls,
          product_image_url: productImageUrl || undefined,
          notes: notes || undefined,
          language,
          script_count: parseInt(scriptCount) || 5,
          target_duration_seconds: parseInt(targetDuration) || 15,
          tiktok_safe: tiktokSafe,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setAnalysis(data as AnalysisResult);
      setStep("select_script");
      toast.success(`${data.scripts?.length || 0} guiones generados`);
    } catch (err: any) {
      console.error("AudioRoll analyze error:", err);
      setError(err.message || "Error en el análisis");
      setStep("input");
      toast.error("Error en análisis");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message });
    }
  }, [refUrls, brollClips, productImageUrl, notes, user, language, scriptCount, targetDuration, tiktokSafe, voiceGender, voiceTone, voicePace]);

  /* ── Step 2: Generate voice for selected script ── */
  const handleGenerateVoice = useCallback(async () => {
    if (selectedScriptIdx === null || !analysis) return;
    const script = analysis.scripts[selectedScriptIdx];
    const textToSpeak = script.safe_version || script.full_script;

    setStep("generating_voice");
    toast.info("Generando narración con ElevenLabs...");

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-audioroll-voice", {
        body: {
          text: textToSpeak,
          language,
          gender: voiceGender,
          tone: voiceTone,
          pace: voicePace,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setVoiceAudioUrl(data.audio_url);
      setStep("results");
      toast.success("Narración generada");

      await updateHistoryRecord(jobIdRef.current, {
        status: "completed", current_step: "results",
        output_summary_json: {
          scripts_count: analysis.scripts.length,
          selected_script_index: selectedScriptIdx,
          voice_audio_url: data.audio_url,
          broll_clips_count: brollClips.filter(c => c.trim()).length,
        },
      });
    } catch (err: any) {
      console.error("Voice generation error:", err);
      setError(err.message);
      setStep("select_script");
      toast.error("Error generando voz");
    }
  }, [selectedScriptIdx, analysis, language, voiceGender, voiceTone, voicePace, brollClips]);

  /* ── Audio playback ── */
  const toggleAudio = useCallback(() => {
    if (!voiceAudioUrl) return;
    if (audioRef.current) {
      if (isPlayingAudio) { audioRef.current.pause(); setIsPlayingAudio(false); }
      else { audioRef.current.play(); setIsPlayingAudio(true); }
    } else {
      const audio = new Audio(voiceAudioUrl);
      audioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.play();
      setIsPlayingAudio(true);
    }
  }, [voiceAudioUrl, isPlayingAudio]);

  const reset = useCallback(() => {
    setStep("input"); setAnalysis(null); setSelectedScriptIdx(null);
    setVoiceAudioUrl(null); setError(null);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    jobIdRef.current = `audioroll_${Date.now()}`;
  }, []);

  /* ── RENDER ── */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">AudioRoll</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mina guiones de TikTok ganadores → genera narración ElevenLabs → ensambla con tu B-roll real.
        </p>
      </div>

      {/* ═══ INPUT STEP ═══ */}
      {step === "input" && !analysis && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          {/* Reference URLs */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Videos de referencia TikTok *</Label>
            <p className="text-xs text-muted-foreground">Pega 1–5 links de videos ganadores para extraer patrones de copy.</p>
            {refUrls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={url} onChange={e => updateUrl(i, e.target.value)} placeholder={`https://www.tiktok.com/... (Video ${i + 1})`} className="flex-1" />
                {refUrls.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeUrl(i)} className="shrink-0 h-10 w-10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {refUrls.length < 5 && (
              <Button variant="outline" size="sm" onClick={addUrl} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar video
              </Button>
            )}
          </div>

          {/* B-roll clips */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Clips B-roll de tu producto *</Label>
            <p className="text-xs text-muted-foreground">Sube tus clips reales verticales. Se editarán automáticamente con cortes cada ~3s.</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {brollClips.map((clip, i) => (
                <VideoUploadField key={i} label={`Clip ${i + 1}`} value={clip} onChange={(url) => updateBroll(i, url)} index={i} />
              ))}
            </div>
            {brollClips.length < 10 && (
              <Button variant="outline" size="sm" onClick={addBrollSlot} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar clip
              </Button>
            )}
          </div>

          {/* Product image + notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploadField label="Imagen del producto (opcional)" value={productImageUrl} onChange={setProductImageUrl} prefix="audioroll_product" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notas (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto del producto, público, mercado..." rows={3} />
            </div>
          </div>

          {/* Quick options */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Guiones</Label>
              <Select value={scriptCount} onValueChange={setScriptCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Duración objetivo</Label>
              <Select value={targetDuration} onValueChange={setTargetDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="20">20s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="45">45s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
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
                <Switch id="tiktok-safe" checked={tiktokSafe} onCheckedChange={setTiktokSafe} />
                <Label htmlFor="tiktok-safe" className="text-sm cursor-pointer">Filtro TikTok anti-ban</Label>
              </div>
            </div>
          </div>

          {/* Voice controls */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2"><Volume2 className="h-4 w-4" /> Voz</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Género</Label>
                <Select value={voiceGender} onValueChange={setVoiceGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Mujer</SelectItem>
                    <SelectItem value="male">Hombre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tono</Label>
                <Select value={voiceTone} onValueChange={setVoiceTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="natural">Natural</SelectItem>
                    <SelectItem value="energetic">Energético</SelectItem>
                    <SelectItem value="testimonial">Testimonial</SelectItem>
                    <SelectItem value="trustworthy">Confiable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Pace</Label>
                <Select value={voicePace} onValueChange={setVoicePace}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="dynamic">Dinámico</SelectItem>
                    <SelectItem value="fast">Rápido</SelectItem>
                  </SelectContent>
                </Select>
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
              <div className="bg-muted/30 rounded-lg p-4 text-xs text-muted-foreground">
                Próximamente: control de corte por beat, reorder manual de clips, mezcla de volúmenes.
              </div>
            </CollapsibleContent>
          </Collapsible>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button onClick={handleAnalyze} className="w-full gradient-cta text-white border-0" size="lg">
            <Sparkles className="mr-2 h-4 w-4" /> Generar AudioRoll
          </Button>
        </div>
      )}

      {/* ═══ LOADING ═══ */}
      {step === "analyzing" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Analizando videos de referencia y generando guiones...</p>
            <p className="text-xs text-muted-foreground mt-1">Extrayendo hooks, estructura, CTA y patrones ganadores</p>
          </div>
        </div>
      )}

      {/* ═══ SELECT SCRIPT ═══ */}
      {step === "select_script" && analysis && (
        <div className="space-y-6">
          {/* Winning patterns */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Patrones Ganadores</h2>
            </div>
            <p className="text-sm text-muted-foreground">{analysis.winning_patterns?.structure_summary}</p>
            <div className="flex flex-wrap gap-2">
              {analysis.winning_patterns?.hook_patterns?.map((h, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
              ))}
            </div>
          </div>

          {/* Scripts */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Elige un guión para narrar</h2>
            <div className="grid gap-3">
              {analysis.scripts?.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedScriptIdx(i)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${selectedScriptIdx === i ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-foreground/30"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedScriptIdx === i ? "default" : "secondary"} className="text-xs">{i + 1}</Badge>
                      <span className="text-sm font-medium text-foreground">{s.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.delivery_style}</Badge>
                      <span className="text-xs text-muted-foreground">~{s.estimated_duration_seconds}s</span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); copyText(s.safe_version || s.full_script, s.title); }}
                      >
                        {copied === s.title ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1"><strong>Ángulo:</strong> {s.angle}</p>
                  <p className="text-xs text-muted-foreground mb-1"><strong>Hook:</strong> {s.hook}</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-3">{s.safe_version || s.full_script}</p>
                  {s.safety_changes && s.safety_changes.length > 0 && (
                    <div className="mt-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                      🛡️ Filtro TikTok aplicado: {s.safety_changes.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Volver al inicio
            </Button>
            <Button
              onClick={handleGenerateVoice}
              disabled={selectedScriptIdx === null}
              className="gradient-cta text-white border-0 gap-1.5"
              size="lg"
            >
              <Music className="h-4 w-4" /> Generar narración con ElevenLabs
            </Button>
          </div>
        </div>
      )}

      {/* ═══ GENERATING VOICE ═══ */}
      {step === "generating_voice" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Generando narración con ElevenLabs...</p>
            <p className="text-xs text-muted-foreground mt-1">Voz {voiceGender === "female" ? "femenina" : "masculina"} · {voiceTone} · {voicePace}</p>
          </div>
        </div>
      )}

      {/* ═══ RESULTS ═══ */}
      {step === "results" && analysis && selectedScriptIdx !== null && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Nuevo AudioRoll
            </Button>
            <Badge variant="secondary" className="text-xs">
              {analysis.scripts?.length} guiones · {brollClips.filter(c => c.trim()).length} clips · Voz {voiceGender === "female" ? "♀" : "♂"}
            </Badge>
          </div>

          {/* Selected script */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Guión seleccionado: {analysis.scripts[selectedScriptIdx].title}</h2>
            </div>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">
              {analysis.scripts[selectedScriptIdx].safe_version || analysis.scripts[selectedScriptIdx].full_script}
            </p>
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => copyText(analysis.scripts[selectedScriptIdx].safe_version || analysis.scripts[selectedScriptIdx].full_script, "Guión")}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar guión
            </Button>
          </div>

          {/* Voice audio */}
          {voiceAudioUrl && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Narración generada</h2>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={toggleAudio} variant="outline" size="sm" className="gap-1.5">
                  {isPlayingAudio ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlayingAudio ? "Pausar" : "Reproducir"}
                </Button>
                <a href={voiceAudioUrl} download className="inline-flex">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Descargar MP3
                  </Button>
                </a>
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => { setVoiceAudioUrl(null); setStep("select_script"); toast.info("Elige otro guión o regenera la voz"); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Regenerar voz
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Voz: {voiceGender === "female" ? "Mujer" : "Hombre"} · Tono: {voiceTone} · Pace: {voicePace} · Idioma: {language}
              </p>
            </div>
          )}

          {/* B-roll clips summary */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">📽️ Clips B-roll ({brollClips.filter(c => c.trim()).length})</h2>
            <p className="text-xs text-muted-foreground">
              Tus clips están listos. Descarga la narración y ensámblalos en CapCut o tu editor favorito con cortes cada ~3 segundos siguiendo los beats del guión.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {brollClips.filter(c => c.trim()).map((clip, i) => (
                <a key={i} href={clip} download className="flex flex-col items-center justify-center h-16 border border-border rounded-lg bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Download className="h-3.5 w-3.5 mb-1" /> Clip {i + 1}
                </a>
              ))}
            </div>
          </div>

          {/* Edit guide */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">🎬 Guía de edición</h2>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>1. <strong>Hook (0–3s):</strong> Usa tu clip más fuerte / product hero shot</p>
              <p>2. <strong>Body:</strong> Cortes cada ~3s alternando entre ángulos de producto</p>
              <p>3. <strong>CTA (últimos 3–5s):</strong> Close-up limpio del producto o demo final</p>
              <p>4. <strong>Audio:</strong> Monta la narración MP3 sobre el timeline de clips</p>
              <p>5. Duración target: ~{targetDuration}s</p>
            </div>
          </div>

          {/* Diagnostics */}
          <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {showDiagnostics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Diagnósticos
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <ExecutionTimeline jobId={jobIdRef.current} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
};

export default AudioRollPage;
