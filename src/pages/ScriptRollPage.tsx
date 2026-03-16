import { useState, useCallback, useRef } from "react";
import {
  Loader2, Copy, Check, Plus, Trash2, Sparkles, AlertCircle,
  ChevronDown, ChevronUp, FileText, Eye, EyeOff, RotateCcw,
  Volume2, Download, RefreshCw, Save, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createHistoryRecord, updateHistoryRecord } from "@/lib/historyService";

/* ── Types ── */
interface ScriptRollInsights {
  detected_hooks: string[];
  detected_ctas: string[];
  structure_pattern: string;
  tone: string;
  recurring_words: string[];
  main_promise: string;
  implicit_objection: string;
  narrator_style: string;
  useful_patterns: string[];
}

interface ScriptRollScript {
  title: string;
  style_tag: string;
  full_script: string;
  safe_version?: string;
  original_version?: string;
  safety_changes?: string[];
}

interface ScriptRollResult {
  insights: ScriptRollInsights;
  scripts: ScriptRollScript[];
}

interface AudioResult {
  audio_url: string;
  audio_storage_path: string;
  voice_id_used: string;
  settings_used: Record<string, any>;
  duration_estimate_seconds: number;
}

interface VoicePreset {
  name: string;
  voice_id: string;
}

interface VoiceSettings {
  voice_id: string;
  gender: string;
  tone: string;
  pace: string;
  stability: number;
  similarity_boost: number;
  style: number;
}

type Step = "input" | "generating" | "results";

const STYLE_OPTIONS = [
  { value: "cercano_al_original", label: "Cercano al original" },
  { value: "testimonial", label: "Testimonial" },
  { value: "problema_solucion", label: "Problema → Solución" },
  { value: "directo_a_venta", label: "Directo a venta" },
  { value: "oferta_urgencia", label: "Oferta / Urgencia" },
  { value: "ugc_natural", label: "UGC natural" },
];

/* ── localStorage helpers ── */
function loadPresets(): VoicePreset[] {
  try {
    return JSON.parse(localStorage.getItem("scriptroll_voice_presets") || "[]");
  } catch { return []; }
}
function savePresets(p: VoicePreset[]) {
  localStorage.setItem("scriptroll_voice_presets", JSON.stringify(p));
}
function loadVoiceSettings(): Partial<VoiceSettings> {
  try {
    return JSON.parse(localStorage.getItem("scriptroll_voice_settings") || "{}");
  } catch { return {}; }
}
function saveVoiceSettings(s: VoiceSettings) {
  localStorage.setItem("scriptroll_voice_settings", JSON.stringify(s));
}

/* ── Voice Panel ── */
function VoicePanel({ settings, onChange, presets, onSavePreset, onSelectPreset }: {
  settings: VoiceSettings;
  onChange: (s: VoiceSettings) => void;
  presets: VoicePreset[];
  onSavePreset: () => void;
  onSelectPreset: (p: VoicePreset) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Volume2 className="h-4 w-4" /> Voz (ElevenLabs)
        </h3>
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAdvanced ? "Menos" : "Avanzado"}
        </button>
      </div>

      {/* Voice ID + presets row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Voice ID</Label>
          <Input
            value={settings.voice_id}
            onChange={e => onChange({ ...settings, voice_id: e.target.value })}
            placeholder="Pega tu Voice ID de ElevenLabs"
            className="font-mono text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={onSavePreset} className="h-9 text-xs gap-1" disabled={!settings.voice_id.trim()}>
          <Save className="h-3 w-3" /> Guardar
        </Button>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Presets:</span>
          {presets.map((p, i) => (
            <Button
              key={i}
              variant={settings.voice_id === p.voice_id ? "default" : "outline"}
              size="sm"
              onClick={() => onSelectPreset(p)}
              className="h-6 text-[10px] gap-1 px-2"
            >
              <Star className="h-2.5 w-2.5" /> {p.name}
            </Button>
          ))}
        </div>
      )}

      {/* Basic controls */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Género</Label>
          <Select value={settings.gender} onValueChange={v => onChange({ ...settings, gender: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Mujer</SelectItem>
              <SelectItem value="male">Hombre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tono</Label>
          <Select value={settings.tone} onValueChange={v => onChange({ ...settings, tone: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="natural">Natural</SelectItem>
              <SelectItem value="energetic">Energético</SelectItem>
              <SelectItem value="testimonial">Testimonial</SelectItem>
              <SelectItem value="trustworthy">Confiable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Velocidad</Label>
          <Select value={settings.pace} onValueChange={v => onChange({ ...settings, pace: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="dynamic">Dinámica</SelectItem>
              <SelectItem value="fast">Rápida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced sliders */}
      {showAdvanced && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Stability</Label>
              <span className="text-[10px] text-muted-foreground">{settings.stability.toFixed(2)}</span>
            </div>
            <Slider value={[settings.stability]} min={0} max={1} step={0.05} onValueChange={([v]) => onChange({ ...settings, stability: v })} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Similarity Boost</Label>
              <span className="text-[10px] text-muted-foreground">{settings.similarity_boost.toFixed(2)}</span>
            </div>
            <Slider value={[settings.similarity_boost]} min={0} max={1} step={0.05} onValueChange={([v]) => onChange({ ...settings, similarity_boost: v })} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Style</Label>
              <span className="text-[10px] text-muted-foreground">{settings.style.toFixed(2)}</span>
            </div>
            <Slider value={[settings.style]} min={0} max={1} step={0.05} onValueChange={([v]) => onChange({ ...settings, style: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Script Card ── */
function ScriptCard({ script, index, tiktokSafe, copied, onCopy, voiceSettings, onAudioGenerated }: {
  script: ScriptRollScript; index: number; tiktokSafe: boolean;
  copied: string | null; onCopy: (text: string, label: string) => void;
  voiceSettings: VoiceSettings;
  onAudioGenerated: (index: number, result: AudioResult) => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayText = tiktokSafe && script.safe_version ? script.safe_version : script.full_script;
  const copyId = `script-${index}`;

  const generateAudio = useCallback(async () => {
    if (!voiceSettings.voice_id.trim()) {
      toast.error("Pega el Voice ID de ElevenLabs primero");
      return;
    }
    setAudioState("generating");
    setAudioError(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-scriptroll-voice", {
        body: {
          text: displayText,
          voice_id: voiceSettings.voice_id.trim(),
          gender: voiceSettings.gender,
          tone: voiceSettings.tone,
          pace: voiceSettings.pace,
          stability: voiceSettings.stability,
          similarity_boost: voiceSettings.similarity_boost,
          style: voiceSettings.style,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setAudioResult(data as AudioResult);
      setAudioState("ready");
      onAudioGenerated(index, data as AudioResult);
      toast.success(`Audio Variante ${index + 1} listo`);
    } catch (err: any) {
      console.error("TTS error:", err);
      setAudioError(err.message || "Error generando audio");
      setAudioState("error");
      toast.error("Error generando audio");
    }
  }, [displayText, voiceSettings, index, onAudioGenerated]);

  const downloadMp3 = useCallback(() => {
    if (!audioResult?.audio_url) return;
    const a = document.createElement("a");
    a.href = audioResult.audio_url;
    a.download = `scriptroll_variante_${index + 1}.mp3`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [audioResult, index]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Variante {index + 1}</span>
          <span className="text-sm text-muted-foreground">— {script.title}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">{script.style_tag}</Badge>
      </div>

      <div className="bg-muted/30 rounded-lg p-4">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{displayText}</p>
      </div>

      {/* Copy + original toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => onCopy(displayText, copyId)} className="h-7 text-xs gap-1">
          {copied === copyId ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === copyId ? "Copiado" : "Copiar"}
        </Button>
        {tiktokSafe && script.original_version && (
          <Button variant="ghost" size="sm" onClick={() => setShowOriginal(!showOriginal)} className="h-7 text-xs gap-1 text-muted-foreground">
            {showOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showOriginal ? "Ocultar original" : "Ver original"}
          </Button>
        )}
        {script.safety_changes && script.safety_changes.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {script.safety_changes.length} cambio(s) safe
          </Badge>
        )}
      </div>

      {showOriginal && script.original_version && (
        <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
          <p className="text-[11px] text-muted-foreground mb-1 font-medium">Versión original (pre-filtro):</p>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{script.original_version}</p>
        </div>
      )}

      {/* Audio section */}
      <div className="border-t border-border/50 pt-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {audioState === "idle" && (
            <Button variant="outline" size="sm" onClick={generateAudio} className="h-7 text-xs gap-1">
              <Volume2 className="h-3 w-3" /> Generar audio
            </Button>
          )}
          {audioState === "generating" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Generando audio…
            </div>
          )}
          {audioState === "ready" && audioResult && (
            <>
              <Button variant="outline" size="sm" onClick={downloadMp3} className="h-7 text-xs gap-1">
                <Download className="h-3 w-3" /> Descargar MP3
              </Button>
              <Button variant="ghost" size="sm" onClick={generateAudio} className="h-7 text-xs gap-1 text-muted-foreground">
                <RefreshCw className="h-3 w-3" /> Regenerar
              </Button>
            </>
          )}
          {audioState === "error" && (
            <>
              <span className="text-xs text-destructive">{audioError}</span>
              <Button variant="outline" size="sm" onClick={generateAudio} className="h-7 text-xs gap-1">
                <RefreshCw className="h-3 w-3" /> Reintentar
              </Button>
            </>
          )}
        </div>
        {audioState === "ready" && audioResult && (
          <audio ref={audioRef} controls src={audioResult.audio_url} className="w-full h-8" />
        )}
      </div>
    </div>
  );
}

/* ── Main ── */
const ScriptRollPage = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("input");
  const [error, setError] = useState<string | null>(null);
  const jobIdRef = useRef(`scriptroll_${Date.now()}`);

  // Inputs
  const [refUrls, setRefUrls] = useState<string[]>([""]);
  const [productUrl, setProductUrl] = useState("");
  const [priceBefore, setPriceBefore] = useState("");
  const [priceNow, setPriceNow] = useState("");
  const [language, setLanguage] = useState("es-MX");
  const [scriptCount, setScriptCount] = useState("5");
  const [scriptStyle, setScriptStyle] = useState("cercano_al_original");
  const [tiktokSafe, setTiktokSafe] = useState(true);

  // Voice
  const savedVoice = loadVoiceSettings();
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voice_id: savedVoice.voice_id || "",
    gender: savedVoice.gender || "female",
    tone: savedVoice.tone || "natural",
    pace: savedVoice.pace || "dynamic",
    stability: savedVoice.stability ?? 0.4,
    similarity_boost: savedVoice.similarity_boost ?? 0.75,
    style: savedVoice.style ?? 0.3,
  });
  const [presets, setPresets] = useState<VoicePreset[]>(loadPresets());
  const [audioVariants, setAudioVariants] = useState<Record<number, AudioResult>>({});

  // Results
  const [result, setResult] = useState<ScriptRollResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  /* Voice settings persistence */
  const handleVoiceChange = useCallback((s: VoiceSettings) => {
    setVoiceSettings(s);
    saveVoiceSettings(s);
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!voiceSettings.voice_id.trim()) return;
    const name = prompt("Nombre del preset:", `Voz ${presets.length + 1}`);
    if (!name) return;
    const updated = [...presets, { name, voice_id: voiceSettings.voice_id.trim() }];
    setPresets(updated);
    savePresets(updated);
    toast.success("Preset guardado");
  }, [voiceSettings, presets]);

  const handleSelectPreset = useCallback((p: VoicePreset) => {
    const updated = { ...voiceSettings, voice_id: p.voice_id };
    setVoiceSettings(updated);
    saveVoiceSettings(updated);
  }, [voiceSettings]);

  const handleAudioGenerated = useCallback((index: number, audioResult: AudioResult) => {
    setAudioVariants(prev => ({ ...prev, [index]: audioResult }));
  }, []);

  /* URL mgmt */
  const addUrl = () => { if (refUrls.length < 5) setRefUrls([...refUrls, ""]); };
  const removeUrl = (i: number) => { if (refUrls.length > 1) setRefUrls(refUrls.filter((_, idx) => idx !== i)); };
  const updateUrl = (i: number, val: string) => { const u = [...refUrls]; u[i] = val; setRefUrls(u); };

  /* Copy */
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error("Error al copiar"); }
  }, []);

  const copyAll = useCallback(async () => {
    if (!result) return;
    const allText = result.scripts.map((s, i) => {
      const text = tiktokSafe && s.safe_version ? s.safe_version : s.full_script;
      return `— Variante ${i + 1}: ${s.title} —\n\n${text}`;
    }).join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
    await copyText(allText, "all");
  }, [result, tiktokSafe, copyText]);

  /* Generate */
  const handleGenerate = useCallback(async () => {
    const urls = refUrls.filter(u => u.trim());
    if (urls.length === 0) { toast.error("Ingresa al menos 1 URL de video de referencia"); return; }

    setStep("generating");
    setError(null);
    setResult(null);
    setAudioVariants({});
    const jobId = jobIdRef.current;

    if (user) {
      await createHistoryRecord({
        user_id: user.id, job_id: jobId, module: "scriptroll",
        title: `ScriptRoll — ${urls.length} ref(s), ${scriptCount} guiones`,
        status: "running", current_step: "generating",
        source_route: "/create/scriptroll",
        input_summary_json: {
          ref_urls: urls, product_url: productUrl || undefined,
          price_before: priceBefore || undefined, price_now: priceNow || undefined,
          script_count: scriptCount, script_style: scriptStyle,
          language, tiktok_safe: tiktokSafe,
        },
        resumable: false,
      });
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-scriptroll", {
        body: {
          video_urls: urls,
          product_url: productUrl || undefined,
          price_before: priceBefore || undefined,
          price_now: priceNow || undefined,
          language,
          script_count: parseInt(scriptCount) || 5,
          script_style: scriptStyle,
          tiktok_safe: tiktokSafe,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setResult(data as ScriptRollResult);
      setStep("results");
      toast.success(`${data.scripts?.length || 0} guiones generados`);

      await updateHistoryRecord(jobId, {
        status: "completed", current_step: "results",
        provider_used: "gemini-2.5-pro",
        output_summary_json: {
          scripts_count: data.scripts?.length || 0,
          insights: data.insights,
          scripts_titles: data.scripts?.map((s: any) => s.title) || [],
        },
      });
    } catch (err: any) {
      console.error("ScriptRoll error:", err);
      setError(err.message || "Error generando guiones");
      setStep("input");
      toast.error("Error en la generación");
      await updateHistoryRecord(jobId, { status: "failed", error_summary: err.message });
    }
  }, [refUrls, productUrl, priceBefore, priceNow, language, scriptCount, scriptStyle, tiktokSafe, user]);

  /* Save audio to history */
  const saveAudioToHistory = useCallback(async () => {
    if (Object.keys(audioVariants).length === 0) return;
    const jobId = jobIdRef.current;
    await updateHistoryRecord(jobId, {
      output_summary_json: {
        scripts_count: result?.scripts?.length || 0,
        insights: result?.insights,
        scripts_titles: result?.scripts?.map(s => s.title) || [],
        selected_voice: { voice_id: voiceSettings.voice_id, tone: voiceSettings.tone, pace: voiceSettings.pace },
        audio_variants: Object.entries(audioVariants).map(([idx, ar]) => ({
          script_index: Number(idx),
          audio_url: ar.audio_url,
          voice_id: ar.voice_id_used,
          settings: ar.settings_used,
        })),
      },
    });
  }, [audioVariants, result, voiceSettings]);

  // Auto-save audio to history when audioVariants change
  const prevAudioCount = useRef(0);
  if (Object.keys(audioVariants).length > prevAudioCount.current) {
    prevAudioCount.current = Object.keys(audioVariants).length;
    saveAudioToHistory();
  }

  const reset = useCallback(() => {
    setStep("input"); setResult(null); setError(null); setAudioVariants({});
    jobIdRef.current = `scriptroll_${Date.now()}`;
  }, []);

  /* ── RENDER ── */
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ScriptRoll</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mina guiones de TikTok ganadores → genera variantes completas listas para narración.
        </p>
      </div>

      {/* ═══ INPUT ═══ */}
      {step === "input" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            {/* Reference URLs */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Videos de referencia *</Label>
              <p className="text-xs text-muted-foreground">Pega 1–5 links de TikTok para extraer patrones de copy ganador.</p>
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

            {/* Product URL */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link del producto TikTok Shop (opcional)</Label>
              <Input value={productUrl} onChange={e => setProductUrl(e.target.value)} placeholder="https://www.tiktok.com/..." />
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Precio antes (opcional)</Label>
                <Input value={priceBefore} onChange={e => setPriceBefore(e.target.value)} placeholder="$49.99" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Precio actual (opcional)</Label>
                <Input value={priceNow} onChange={e => setPriceNow(e.target.value)} placeholder="$29.99" />
              </div>
            </div>

            {/* Options row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Guiones</Label>
                <Select value={scriptCount} onValueChange={setScriptCount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Estilo</Label>
                <Select value={scriptStyle} onValueChange={setScriptStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STYLE_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Idioma</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es-MX">Español (MX)</SelectItem>
                    <SelectItem value="es-ES">Español (ES)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Filtro TikTok-safe</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch checked={tiktokSafe} onCheckedChange={setTiktokSafe} />
                  <span className="text-xs text-muted-foreground">Suaviza claims sensibles</span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {/* Generate button */}
            <Button onClick={handleGenerate} className="w-full gradient-cta text-white border-0 h-11 gap-2" size="lg">
              <Sparkles className="h-4 w-4" /> Generar guiones
            </Button>
          </div>

          {/* Voice panel always visible */}
          <VoicePanel
            settings={voiceSettings}
            onChange={handleVoiceChange}
            presets={presets}
            onSavePreset={handleSavePreset}
            onSelectPreset={handleSelectPreset}
          />
        </div>
      )}

      {/* ═══ GENERATING ═══ */}
      {step === "generating" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Analizando videos y generando guiones...</p>
            <p className="text-xs text-muted-foreground mt-1">Extrayendo hooks, estructura, tono y patrones ganadores</p>
          </div>
        </div>
      )}

      {/* ═══ RESULTS ═══ */}
      {step === "results" && result && (
        <div className="space-y-5">
          {/* Voice panel in results too */}
          <VoicePanel
            settings={voiceSettings}
            onChange={handleVoiceChange}
            presets={presets}
            onSavePreset={handleSavePreset}
            onSelectPreset={handleSelectPreset}
          />

          {/* Insights panel */}
          <div className="rounded-xl border border-border bg-card p-4">
            <button onClick={() => setShowInsights(!showInsights)} className="flex w-full items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Insights detectados
              </h3>
              {showInsights ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showInsights && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Hooks detectados:</p>
                  {result.insights.detected_hooks?.map((h, i) => (
                    <p key={i} className="text-muted-foreground pl-2">• {h}</p>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">CTAs detectados:</p>
                  {result.insights.detected_ctas?.map((c, i) => (
                    <p key={i} className="text-muted-foreground pl-2">• {c}</p>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Estructura:</p>
                  <p className="text-muted-foreground pl-2">{result.insights.structure_pattern}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Tono:</p>
                  <p className="text-muted-foreground pl-2">{result.insights.tone}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Palabras recurrentes:</p>
                  <div className="flex flex-wrap gap-1 pl-2">
                    {result.insights.recurring_words?.map((w, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{w}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Promesa principal:</p>
                  <p className="text-muted-foreground pl-2">{result.insights.main_promise}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Objeción implícita:</p>
                  <p className="text-muted-foreground pl-2">{result.insights.implicit_objection}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Estilo del narrador:</p>
                  <p className="text-muted-foreground pl-2">{result.insights.narrator_style}</p>
                </div>
              </div>
            )}
          </div>

          {/* Scripts header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {result.scripts.length} guiones generados
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyAll} className="h-7 text-xs gap-1">
                {copied === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === "all" ? "Copiados" : "Copiar todos"}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs gap-1">
                <RotateCcw className="h-3 w-3" /> Nuevo
              </Button>
            </div>
          </div>

          {/* Script cards */}
          <div className="space-y-4">
            {result.scripts.map((script, i) => (
              <ScriptCard
                key={i}
                script={script}
                index={i}
                tiktokSafe={tiktokSafe}
                copied={copied}
                onCopy={copyText}
                voiceSettings={voiceSettings}
                onAudioGenerated={handleAudioGenerated}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptRollPage;
