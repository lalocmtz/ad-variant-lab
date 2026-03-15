import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Video, Clock, Loader2, ChevronDown, ChevronUp, Package, RefreshCw,
  Download, Play, Music, RotateCcw, ShoppingBag, FlaskConical,
  Image as ImageIcon, ExternalLink, AlertCircle, CheckCircle2, XCircle,
} from "lucide-react";
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

interface BofBatchHistoryEntry {
  id: string;
  type: "bof_batch";
  created_at: string | null;
  product_name: string;
  product_image_url: string;
  status: string;
  selected_formats: string[];
  metadata_json: Record<string, any>;
  variants: BofVariantRow[];
}

interface BofVariantRow {
  id: string;
  format_id: string;
  script_text: string | null;
  generated_image_url: string | null;
  raw_video_url: string | null;
  voice_audio_url: string | null;
  final_video_url: string | null;
  status: string;
  error_message: string | null;
}

type HistoryEntry = AnalysisHistoryEntry | BrollLabHistoryEntry | BofBatchHistoryEntry;

// ─── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POLL_INTERVAL = 8000;
const MAX_POLLS = 60;

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

function downloadFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary"; icon?: React.ReactNode }> = {
    completed: { label: "✓ Listo", variant: "default", icon: <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> },
    failed: { label: "✗ Error", variant: "destructive", icon: <XCircle className="h-2.5 w-2.5 mr-0.5" /> },
    image_ready: { label: "Imagen lista", variant: "secondary" },
    script_ready: { label: "Script listo", variant: "outline" },
    animating: { label: "Animando…", variant: "outline" },
    approved: { label: "Aprobado", variant: "secondary" },
    pending: { label: "Pendiente", variant: "outline" },
  };
  const info = map[status] || { label: status, variant: "outline" as const };
  return (
    <Badge variant={info.variant} className="text-[10px]">
      {info.icon}{info.label}
    </Badge>
  );
}

// ─── BOF Batch expanded card ─────────────────────────────────

function BofBatchExpandedCard({
  entry,
  onRetryComplete,
}: {
  entry: BofBatchHistoryEntry;
  onRetryComplete: (batchId: string, updatedVariants: BofVariantRow[]) => void;
}) {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");

  const completedVariants = entry.variants.filter(v => v.status === "completed");
  const failedVariants = entry.variants.filter(v => v.status === "failed");
  const retryableVariants = entry.variants.filter(
    v => v.generated_image_url && !v.final_video_url && !v.raw_video_url
  );

  const canRetryAnimation = retryableVariants.length > 0;
  const canResumeApproval = entry.status === "awaiting_approval";

  // Retry animation for variants that have images but no video
  const handleRetryAnimation = async () => {
    setRetrying(true);
    const updatedVariants = [...entry.variants];

    try {
      for (let i = 0; i < retryableVariants.length; i++) {
        const v = retryableVariants[i];
        const idx = updatedVariants.findIndex(uv => uv.id === v.id);
        setRetryMessage(`Animando variante ${i + 1}/${retryableVariants.length}…`);

        try {
          const { data: animData, error: animErr } = await supabase.functions.invoke("animate-bof-scene", {
            body: {
              image_url: v.generated_image_url,
              motion_prompt: `Animate this product image for a TikTok Shop ad. Realistic handheld smartphone motion, subtle drift, natural lighting. Duration: 9 seconds. Vertical 9:16.`,
              scene_index: 0,
            },
          });

          if (animErr || animData?.error) {
            updatedVariants[idx] = { ...updatedVariants[idx], status: "failed", error_message: animData?.error || "Error de animación" };
            continue;
          }

          // Poll for completion
          setRetryMessage(`Esperando clip ${i + 1}/${retryableVariants.length}…`);
          let clipUrl: string | null = null;
          for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
            await sleep(POLL_INTERVAL);
            const { data: pollData } = await supabase.functions.invoke("get-video-task", {
              body: { taskId: animData.taskId, engine: "sora2" },
            });
            if (pollData?.status === "completed" && pollData?.videoUrl) {
              clipUrl = pollData.videoUrl;
              break;
            }
            if (pollData?.shouldStopPolling) break;
          }

          if (clipUrl) {
            updatedVariants[idx] = {
              ...updatedVariants[idx],
              raw_video_url: clipUrl,
              final_video_url: clipUrl,
              status: "completed",
              error_message: null,
            };
            // Update DB
            await supabase.from("bof_video_variants").update({
              raw_video_url: clipUrl,
              final_video_url: clipUrl,
              status: "completed",
            }).eq("id", v.id);
          } else {
            updatedVariants[idx] = { ...updatedVariants[idx], status: "failed", error_message: "Timeout en animación" };
          }
        } catch (e: any) {
          updatedVariants[idx] = { ...updatedVariants[idx], status: "failed", error_message: e.message };
        }
      }

      // Update batch status
      const allCompleted = updatedVariants.every(v => v.status === "completed" || v.status === "failed");
      if (allCompleted) {
        await supabase.from("bof_video_batches").update({ status: "completed" }).eq("id", entry.id);
      }

      onRetryComplete(entry.id, updatedVariants);
      const successCount = updatedVariants.filter(v => v.status === "completed").length;
      toast.success(`${successCount} video${successCount !== 1 ? "s" : ""} recuperado${successCount !== 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(e.message || "Error reintentando");
    } finally {
      setRetrying(false);
      setRetryMessage("");
    }
  };

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5 space-y-5">
      {/* Product summary */}
      <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border/50">
        <img src={entry.product_image_url} alt={entry.product_name} className="h-20 w-20 rounded-lg object-cover shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{entry.product_name}</p>
          {entry.metadata_json?.current_price && (
            <p className="text-sm text-foreground">
              ${entry.metadata_json.current_price}
              {entry.metadata_json.old_price && (
                <span className="text-xs text-muted-foreground line-through ml-2">${entry.metadata_json.old_price}</span>
              )}
            </p>
          )}
          {entry.metadata_json?.main_benefit && (
            <p className="text-xs text-muted-foreground">{entry.metadata_json.main_benefit}</p>
          )}
          {entry.metadata_json?.offer && (
            <p className="text-xs text-muted-foreground">Oferta: {entry.metadata_json.offer}</p>
          )}
          {entry.metadata_json?.audience && (
            <p className="text-xs text-muted-foreground">Audiencia: {entry.metadata_json.audience}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {(entry.selected_formats || []).map((f: string) => (
              <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
            onClick={() => downloadFile(entry.product_image_url, `${entry.product_name}_producto.png`)}>
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{completedVariants.length} completado{completedVariants.length !== 1 ? "s" : ""}</span>
        {failedVariants.length > 0 && <span className="text-destructive">{failedVariants.length} fallido{failedVariants.length !== 1 ? "s" : ""}</span>}
        {retryableVariants.length > 0 && <span className="text-amber-600">{retryableVariants.length} con imagen sin video</span>}
      </div>

      {/* Action buttons */}
      {(canRetryAnimation || canResumeApproval) && (
        <div className="flex gap-2">
          {canRetryAnimation && (
            <Button
              onClick={handleRetryAnimation}
              disabled={retrying}
              variant="default"
              size="sm"
              className="gap-1.5"
            >
              {retrying ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {retryMessage}</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" /> Reintentar Videos ({retryableVariants.length})</>
              )}
            </Button>
          )}
          {canResumeApproval && (
            <Button
              onClick={() => navigate(`/create/bof-videos?resume=${entry.id}`)}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retomar Aprobación
            </Button>
          )}
        </div>
      )}

      {/* Variants grid */}
      {entry.variants.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-3">Variantes</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entry.variants.map((v, idx) => (
              <div key={v.id} className="rounded-lg border border-border/60 bg-card/80 overflow-hidden">
                {/* Video or image preview */}
                {v.final_video_url || v.raw_video_url ? (
                  <div className="relative aspect-[9/16] max-h-[240px] bg-black">
                    <video
                      src={v.final_video_url || v.raw_video_url || ""}
                      className="w-full h-full object-contain"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ) : v.generated_image_url ? (
                  <div className="relative aspect-[9/16] max-h-[240px]">
                    <img src={v.generated_image_url} alt={`Variante ${idx + 1}`} className="w-full h-full object-cover" />
                    {!v.final_video_url && !v.raw_video_url && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Badge variant="secondary" className="text-[10px]">
                          <AlertCircle className="h-2.5 w-2.5 mr-1" /> Sin video
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[9/16] max-h-[240px] bg-muted flex items-center justify-center">
                    <Video className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}

                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">{v.format_id}</Badge>
                    <StatusBadge status={v.status} />
                  </div>

                  {v.script_text && (
                    <p className="text-[10px] text-muted-foreground line-clamp-3">{v.script_text}</p>
                  )}

                  {v.error_message && (
                    <p className="text-[10px] text-destructive">{v.error_message}</p>
                  )}

                  <div className="flex gap-1.5">
                    {(v.final_video_url || v.raw_video_url) && (
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"
                        onClick={() => downloadFile(v.final_video_url || v.raw_video_url!, `bof_${entry.product_name}_v${idx + 1}.mp4`)}>
                        <Download className="h-3 w-3 mr-1" /> Video
                      </Button>
                    )}
                    {v.generated_image_url && (
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                        onClick={() => downloadFile(v.generated_image_url!, `bof_${entry.product_name}_v${idx + 1}_img.png`)}>
                        <ImageIcon className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

  const handleGenerateNewVariants = async () => {
    setGenerating(true);
    try {
      const existingScripts = entry.voice_variants
        .filter((v) => v.status === "done")
        .map((v) => v.script.full_text);

      setGenMessage("Generando nuevos guiones únicos...");

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
      {/* Input summary */}
      {(entry.product_url || entry.tiktok_urls?.length > 0) && (
        <div className="p-3 rounded-lg bg-card border border-border/50 space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Inputs del proyecto</h4>
          {entry.product_url && (
            <a href={entry.product_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> {entry.product_url}
            </a>
          )}
          {entry.tiktok_urls?.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> TikTok #{i + 1}
            </a>
          ))}
        </div>
      )}

      {/* Scene images with download */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Escenas</h4>
        <div className="grid grid-cols-4 gap-2">
          {entry.scenes.map((scene) => (
            <div key={scene.scene_index} className="relative group">
              {scene.image_url ? (
                <>
                  <img src={scene.image_url} alt={`Escena ${scene.scene_index + 1}`} className="rounded-md aspect-[9/16] object-cover w-full" />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => downloadFile(scene.image_url, `broll_escena_${scene.scene_index + 1}.png`)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </>
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

// ─── Analysis expanded card ──────────────────────────────────

function AnalysisExpandedCard({
  entry,
  onVideoStateChange,
}: {
  entry: AnalysisHistoryEntry;
  onVideoStateChange: (entryId: string, variantIndex: number, videoState: any) => void;
}) {
  const variants = (entry.results?.variants || []) as VariantResult[];

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5 space-y-4">
      {/* Source URL */}
      {entry.tiktok_url && (
        <div className="p-3 rounded-lg bg-card border border-border/50">
          <h4 className="text-xs font-medium text-muted-foreground mb-1">URL fuente</h4>
          <a href={entry.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> {entry.tiktok_url}
          </a>
        </div>
      )}

      {/* Image gallery */}
      {variants.some(v => v.generated_image_url) && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Imágenes generadas</h4>
          <div className="grid grid-cols-3 gap-2">
            {variants.filter(v => v.generated_image_url).map((v, idx) => (
              <div key={v.variant_id || idx} className="relative group">
                <img src={v.generated_image_url} alt={`Variante ${idx + 1}`} className="rounded-md aspect-[9/16] object-cover w-full" />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => downloadFile(v.generated_image_url, `variant_${idx + 1}_img.png`)}
                >
                  <Download className="h-3 w-3" />
                </Button>
                <div className="absolute top-1 right-1">
                  <StatusBadge status={v.video_status === "completed" ? "completed" : v.video_url ? "completed" : "image_ready"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full variant cards */}
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
            onVideoStateChange={(videoState) => onVideoStateChange(entry.id, idx, videoState)}
          />
        ))}
      </div>
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
  const [filterType, setFilterType] = useState<"all" | "analysis" | "broll_lab" | "bof_batch">("all");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [analysisRes, brollRes, bofBatchRes] = await Promise.all([
        supabase.from("analysis_history").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("broll_lab_history" as any).select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("bof_video_batches").select("*").order("created_at", { ascending: false }).limit(50),
      ]);

      const analysisEntries: HistoryEntry[] = (analysisRes.data || []).map((d: any) => ({ ...d, type: "analysis" as const }));
      const brollEntries: HistoryEntry[] = (brollRes.data || []).map((d: any) => ({ ...d, type: "broll_lab" as const }));

      const bofBatches = bofBatchRes.data || [];
      let bofEntries: HistoryEntry[] = [];

      if (bofBatches.length > 0) {
        const batchIds = bofBatches.map((b: any) => b.id);
        const { data: variantsData } = await supabase
          .from("bof_video_variants")
          .select("*")
          .in("batch_id", batchIds);

        const variantsByBatch: Record<string, BofVariantRow[]> = {};
        for (const v of (variantsData || []) as any[]) {
          if (!variantsByBatch[v.batch_id]) variantsByBatch[v.batch_id] = [];
          variantsByBatch[v.batch_id].push(v);
        }

        bofEntries = bofBatches.map((b: any) => ({
          id: b.id,
          type: "bof_batch" as const,
          created_at: b.created_at,
          product_name: b.product_name,
          product_image_url: b.product_image_url,
          status: b.status,
          selected_formats: b.selected_formats || [],
          metadata_json: b.metadata_json || {},
          variants: variantsByBatch[b.id] || [],
        }));
      }

      const all = [...analysisEntries, ...brollEntries, ...bofEntries].sort((a, b) => {
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

  const handleBofRetryComplete = useCallback((batchId: string, updatedVariants: BofVariantRow[]) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === batchId && e.type === "bof_batch"
          ? { ...e, variants: updatedVariants, status: "completed" }
          : e
      )
    );
  }, []);

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

  const filteredEntries = filterType === "all" ? entries : entries.filter(e => e.type === filterType);

  const countByType = {
    all: entries.length,
    analysis: entries.filter(e => e.type === "analysis").length,
    broll_lab: entries.filter(e => e.type === "broll_lab").length,
    bof_batch: entries.filter(e => e.type === "bof_batch").length,
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">
          Todos tus proyectos generados. Videos, imágenes y variantes — todo en un solo lugar.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "all", label: "Todo", icon: Clock },
          { key: "analysis", label: "Video Variants", icon: Video },
          { key: "bof_batch", label: "BOF Videos", icon: ShoppingBag },
          { key: "broll_lab", label: "B-Roll Lab", icon: FlaskConical },
        ] as const).map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={filterType === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(key)}
            className="gap-1.5 text-xs"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {countByType[key] > 0 && (
              <Badge variant={filterType === key ? "secondary" : "outline"} className="text-[9px] ml-1 px-1.5 py-0">
                {countByType[key]}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {filterType === "all"
              ? "Sin historial aún. Genera variantes para verlas aquí."
              : `Sin proyectos de ${filterType === "analysis" ? "Video Variants" : filterType === "bof_batch" ? "BOF Videos" : "B-Roll Lab"} aún.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;

            // ─── BOF Batch ───
            if (entry.type === "bof_batch") {
              const bof = entry as BofBatchHistoryEntry;
              const completedCount = bof.variants.filter(v => v.status === "completed").length;
              const totalCount = bof.variants.length;
              const hasRetryable = bof.variants.some(v => v.generated_image_url && !v.final_video_url && !v.raw_video_url);
              const statusLabels: Record<string, string> = {
                pending: "Pendiente",
                generating_scripts: "Generando scripts",
                generating_images: "Generando imágenes",
                awaiting_approval: "Aprobación pendiente",
                animating_scenes: "Animando",
                completed: "Completado",
                failed: "Error",
              };

              return (
                <div key={bof.id} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <img src={bof.product_image_url} alt={bof.product_name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {bof.product_name}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">
                          <ShoppingBag className="h-2.5 w-2.5 mr-0.5" /> BOF Videos
                        </Badge>
                        {bof.status !== "completed" && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                            {statusLabels[bof.status] || bof.status}
                          </Badge>
                        )}
                        {hasRetryable && (
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                            Recuperable
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {completedCount}/{totalCount} videos · {formatDate(bof.created_at)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toggle(bof.id)} className="gap-1.5 text-xs">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isExpanded ? "Ocultar" : "Ver proyecto"}
                    </Button>
                  </div>
                  {isExpanded && <BofBatchExpandedCard entry={bof} onRetryComplete={handleBofRetryComplete} />}
                </div>
              );
            }

            // ─── B-Roll Lab ───
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
                        <Badge variant="secondary" className="text-[10px]">
                          <FlaskConical className="h-2.5 w-2.5 mr-0.5" /> B-Roll Lab
                        </Badge>
                        {stepLabel && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                            {stepLabel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(broll.created_at)}</p>
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

            // ─── Analysis (Video Variants) ───
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {variantCount} variant{variantCount !== 1 ? "es" : "e"} generada{variantCount !== 1 ? "s" : ""}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        <Video className="h-2.5 w-2.5 mr-0.5" /> Video Variants
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analysis.tiktok_url && (
                        <a href={analysis.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 mr-2">
                          <ExternalLink className="h-2.5 w-2.5" /> fuente
                        </a>
                      )}
                      {formatDate(analysis.created_at)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggle(analysis.id)} className="gap-1.5 text-xs">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Ocultar" : "Ver variantes"}
                  </Button>
                </div>
                {isExpanded && (
                  <AnalysisExpandedCard entry={analysis} onVideoStateChange={handleVideoStateChange} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
