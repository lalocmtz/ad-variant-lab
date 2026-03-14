import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Clock, Loader2, ChevronDown, ChevronUp, Package, RefreshCw, Download, Play, Music, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import VariantCard from "@/components/VariantCard";
import type { VariantResult, VideoGenerationStatus } from "@/pages/Index";
import type { BrollLabAnalysis, VoiceVariant, SceneResult, BrollLabInputs } from "@/lib/broll_lab_types";

// ─── Types ───────────────────────────────────────────────────

interface AnalysisHistoryEntry {
  id: string;
  type: "analysis";
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: { variants?: VariantResult[]; [key: string]: any } | null;
}

interface BrollLabHistoryEntry {
  id: string;
  type: "broll_lab";
  created_at: string | null;
  product_image_url: string;
  product_url: string;
  tiktok_urls: string[];
  analysis: BrollLabAnalysis;
  scenes: SceneResult[];
  master_video_urls: string[];
  voice_variants: VoiceVariant[];
  variant_count: number;
  inputs: BrollLabInputs;
  pipeline_step: string;
}

type HistoryEntry = AnalysisHistoryEntry | BrollLabHistoryEntry;

// ─── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invokeFn<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name} failed`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function invokeRaw(name: string, body: Record<string, unknown>): Promise<ArrayBuffer> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text() || `${name} failed`);
  return resp.arrayBuffer();
}

// ─── B-Roll Lab expanded card ────────────────────────────────

function BrollLabExpandedCard({
  entry,
  onVariantsUpdated,
}: {
  entry: BrollLabHistoryEntry;
  onVariantsUpdated: (id: string, newVariants: VoiceVariant[], newCount: number) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateNewVariants = async () => {
    setGenerating(true);
    try {
      // Collect existing scripts to avoid duplicates
      const existingScripts = entry.voice_variants
        .filter((v) => v.status === "done")
        .map((v) => v.script.full_text);

      setGenMessage("Generando nuevos guiones únicos...");

      // Call analyze-broll-lab with existing_scripts to get NEW scripts only
      const covers = entry.tiktok_urls.map((url) => ({ cover_url: "", title: url }));
      const newAnalysis = await invokeFn<BrollLabAnalysis>("analyze-broll-lab", {
        covers: covers.length > 0 ? covers : [{ cover_url: entry.product_image_url, title: "product" }],
        product_image_url: entry.inputs.productImageUrl,
        product_url: entry.inputs.productUrl,
        language: entry.inputs.language,
        accent: entry.inputs.accent,
        voice_tone: entry.inputs.voiceTone,
        voice_count: entry.inputs.voiceVariantCount,
        existing_scripts: existingScripts,
      });

      if (!newAnalysis.voice_scripts || newAnalysis.voice_scripts.length === 0) {
        throw new Error("No se generaron nuevos guiones");
      }

      // Generate voices for each new script
      const masterVideoUrl = entry.master_video_urls[0];
      const newVariants: VoiceVariant[] = newAnalysis.voice_scripts.map((script) => ({
        variant_index: entry.voice_variants.length + script.variant_index,
        script,
        status: "generating_voice" as const,
      }));

      for (let i = 0; i < newVariants.length; i++) {
        setGenMessage(`Generando voz ${i + 1}/${newVariants.length}...`);
        try {
          const audioBuffer = await invokeRaw("generate-bof-voice", {
            text: newVariants[i].script.full_text,
            language: entry.inputs.language,
            accent: entry.inputs.accent,
          });

          const bytes = new Uint8Array(audioBuffer);
          let binary = "";
          for (let b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
          const base64Audio = btoa(binary);

          const mergeResult = await invokeFn<{ audio_url?: string; video_url?: string }>("merge-broll-audio", {
            video_url: masterVideoUrl,
            audio_base64: base64Audio,
            variant_id: `broll_regen_v${i}_${Date.now()}`,
          });

          newVariants[i].audio_url = mergeResult.audio_url;
          newVariants[i].final_video_url = mergeResult.video_url || masterVideoUrl;
          newVariants[i].status = "done";
        } catch (e: any) {
          newVariants[i].status = "error";
          newVariants[i].error = e.message;
        }
        if (i < newVariants.length - 1) await sleep(1000);
      }

      // Merge old + new variants and persist
      const allVariants = [...entry.voice_variants, ...newVariants];
      const doneCount = allVariants.filter((v) => v.status === "done").length;

      await supabase
        .from("broll_lab_history" as any)
        .update({ voice_variants: allVariants, variant_count: doneCount } as any)
        .eq("id", entry.id);

      onVariantsUpdated(entry.id, allVariants, doneCount);
      toast.success(`${newVariants.filter((v) => v.status === "done").length} nuevas variantes generadas`);
    } catch (e: any) {
      console.error("Re-generation error:", e);
      toast.error(e.message || "Error generando nuevas variantes");
    } finally {
      setGenerating(false);
      setGenMessage("");
    }
  };

  const videoUrls = entry.master_video_urls;

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5 space-y-5">
      {/* Scene images */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Escenas</h4>
        <div className="grid grid-cols-4 gap-2">
          {entry.scenes.map((scene) => (
            <div key={scene.scene_index}>
              {scene.image_url ? (
                <img src={scene.image_url} alt={`Escena ${scene.scene_index + 1}`} className="rounded-md aspect-[9/16] object-cover w-full" />
              ) : (
                <div className="rounded-md aspect-[9/16] bg-muted" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Voice variants with download */}
      {entry.voice_variants.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            {entry.voice_variants.length} Variantes de voz
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entry.voice_variants.map((v, idx) => (
              <div key={idx} className="rounded-lg border border-border/60 bg-card/80 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">Variante {idx + 1}</Badge>
                  <Badge variant="outline" className="text-[10px]">{v.script.tone}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-3">{v.script.full_text}</p>
                <div className="flex gap-1.5">
                  {videoUrls[0] && (
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"
                      onClick={() => downloadFile(videoUrls[0], `broll_v${idx + 1}_video.mp4`)}>
                      <Download className="h-3 w-3 mr-1" /> Video
                    </Button>
                  )}
                  {v.audio_url && (
                    <Button size="sm" variant="ghost" className="flex-1 h-7 text-[10px]"
                      onClick={() => downloadFile(v.audio_url!, `broll_v${idx + 1}_audio.mp3`)}>
                      <Music className="h-3 w-3 mr-1" /> Audio
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate new variants button */}
      <Button
        onClick={handleGenerateNewVariants}
        disabled={generating}
        className="w-full gradient-cta text-white border-0 h-10"
      >
        {generating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {genMessage}</>
        ) : (
          <><RefreshCw className="h-4 w-4 mr-2" /> Generar nuevas variantes (diferentes)</>
        )}
      </Button>
    </div>
  );
}

// ─── Main HistoryPage ────────────────────────────────────────

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Fetch both tables in parallel
      const [analysisRes, brollRes] = await Promise.all([
        supabase.from("analysis_history").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("broll_lab_history" as any).select("*").order("created_at", { ascending: false }).limit(50),
      ]);

      const analysisEntries: HistoryEntry[] = (analysisRes.data || []).map((d: any) => ({ ...d, type: "analysis" as const }));
      const brollEntries: HistoryEntry[] = (brollRes.data || []).map((d: any) => ({ ...d, type: "broll_lab" as const }));

      // Merge and sort by date descending
      const all = [...analysisEntries, ...brollEntries].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      setEntries(all);
      setLoading(false);
    };
    load();
  }, [user]);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleBrollVariantsUpdated = useCallback((id: string, newVariants: VoiceVariant[], newCount: number) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id && e.type === "broll_lab"
          ? { ...e, voice_variants: newVariants, variant_count: newCount }
          : e
      )
    );
  }, []);

  // Persist variant video state changes back to analysis_history
  const handleVideoStateChange = useCallback(async (
    entryId: string,
    variantIndex: number,
    videoState: { video_task_id?: string; video_status?: VideoGenerationStatus; video_url?: string; video_error?: string; video_mode?: string }
  ) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || entry.type !== "analysis" || !entry.results?.variants) return entry;
        const updatedVariants = [...entry.results.variants];
        updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], ...videoState };
        return { ...entry, results: { ...entry.results, variants: updatedVariants } };
      })
    );

    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.type !== "analysis" || !entry.results?.variants) return;
    const updatedVariants = [...entry.results.variants];
    updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], ...videoState };
    await supabase
      .from("analysis_history")
      .update({ results: { ...entry.results, variants: updatedVariants } as any })
      .eq("id", entryId);
  }, [entries]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">
          Todos tus proyectos generados. Puedes regenerar variantes sin empezar de cero.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Sin historial aún. Genera variantes para verlas aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const date = entry.created_at ? new Date(entry.created_at) : null;

            if (entry.type === "broll_lab") {
              const broll = entry as BrollLabHistoryEntry;
              const isComplete = broll.pipeline_step === "done";
              const stepLabels: Record<string, string> = {
                downloading: "Descargando",
                analyzing: "Analizando",
                generating_images: "Generando imágenes",
                awaiting_approval: "Esperando aprobación",
                animating: "Animando",
                stitching: "Ensamblando",
                generating_voices: "Generando voces",
                merging: "Fusionando",
                error: "Error",
              };
              const stepLabel = !isComplete ? stepLabels[broll.pipeline_step] || broll.pipeline_step : null;

              return (
                <div key={broll.id} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <img src={broll.product_image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {isComplete
                            ? `${broll.variant_count} variante${broll.variant_count !== 1 ? "s" : ""} de voz`
                            : "Proyecto incompleto"}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">B-Roll Lab</Badge>
                        {stepLabel && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                            {stepLabel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {date ? date.toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" }) : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!isComplete && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => navigate(`/create/broll-lab?resume=${broll.id}`)}
                          className="gap-1.5 text-xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Retomar
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => toggle(broll.id)} className="gap-1.5 text-xs">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isExpanded ? "Ocultar" : "Ver proyecto"}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <BrollLabExpandedCard entry={broll} onVariantsUpdated={handleBrollVariantsUpdated} />
                  )}
                </div>
              );
            }

            // Analysis history entry
            const analysis = entry as AnalysisHistoryEntry;
            const variants = (analysis.results?.variants || []) as VariantResult[];
            const coverUrl = variants[0]?.generated_image_url;
            const variantCount = analysis.variant_count || variants.length || 0;

            return (
              <div key={analysis.id} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {variantCount} variant{variantCount !== 1 ? "s" : ""} generated
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggle(analysis.id)} className="gap-1.5 text-xs">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Ocultar" : "Ver variantes"}
                  </Button>
                </div>
                {isExpanded && variants.length > 0 && (
                  <div className="border-t border-border bg-muted/20 px-5 py-5">
                    <div className="grid gap-6 lg:grid-cols-3">
                      {variants.map((v, idx) => (
                        <VariantCard
                          key={v.variant_id || idx}
                          variant={v}
                          language={v.script_variant?.language || "es-MX"}
                          accent="mexicano"
                          onRegenerate={() => {}}
                          onApprove={() => {}}
                          onReject={() => {}}
                          onVideoStateChange={(videoState) => handleVideoStateChange(analysis.id, idx, videoState)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
