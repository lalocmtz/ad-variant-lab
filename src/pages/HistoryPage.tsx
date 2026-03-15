import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Video, Clock, Loader2, ChevronDown, ChevronUp, Package, RefreshCw,
  Download, Play, Music, RotateCcw, ShoppingBag, FlaskConical,
  Image as ImageIcon, ExternalLink, AlertCircle, CheckCircle2, XCircle,
  Zap, Sparkles, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import VariantCard from "@/components/VariantCard";
import type { VariantResult, VideoGenerationStatus } from "@/pages/Index";
import type { BrollLabAnalysis, VoiceVariant, SceneResult, BrollLabInputs } from "@/lib/broll_lab_types";
import type { HistoryRecord } from "@/lib/historyService";

// ─── Types ───────────────────────────────────────────────────

interface UnifiedEntry {
  id: string;
  source: "bof" | "analysis" | "broll_lab" | "generation_history";
  module: string;
  title: string;
  status: string;
  preview_url: string;
  created_at: string;
  raw: any; // original data
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

// ─── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POLL_INTERVAL = 8000;
const MAX_POLLS = 60;

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
  return new Date(dateStr).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: "✓ Listo", color: "text-emerald-600" },
  success: { label: "✓ Listo", color: "text-emerald-600" },
  done: { label: "✓ Listo", color: "text-emerald-600" },
  failed: { label: "✗ Error", color: "text-destructive" },
  error: { label: "✗ Error", color: "text-destructive" },
  running: { label: "⟳ En progreso", color: "text-primary" },
  pending: { label: "⏳ Pendiente", color: "text-muted-foreground" },
  queued: { label: "⏳ En cola", color: "text-muted-foreground" },
  awaiting_approval: { label: "👁 Aprobación", color: "text-amber-600" },
  partial: { label: "⚡ Parcial", color: "text-amber-600" },
};

function StatusLabel({ status }: { status: string }) {
  const info = STATUS_MAP[status] || { label: status, color: "text-muted-foreground" };
  return <span className={`text-[11px] font-medium ${info.color}`}>{info.label}</span>;
}

const MODULE_ICONS: Record<string, { icon: React.ComponentType<any>; label: string }> = {
  bof_videos: { icon: ShoppingBag, label: "BOF Videos" },
  video_variants: { icon: Video, label: "Video Variants" },
  broll_lab: { icon: FlaskConical, label: "B-Roll Lab" },
  prompt_lab: { icon: Sparkles, label: "Prompt Lab" },
  ugc_arcade: { icon: Zap, label: "UGC Arcade" },
};

// ─── Main HistoryPage ────────────────────────────────────────

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModule, setFilterModule] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
    setLoading(true);
    const unified: UnifiedEntry[] = [];

    // 1. BOF batches
    try {
      const { data: bofBatches } = await supabase
        .from("bof_video_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bofBatches && bofBatches.length > 0) {
        const batchIds = bofBatches.map((b: any) => b.id);
        const { data: variantsData } = await supabase
          .from("bof_video_variants")
          .select("*")
          .in("batch_id", batchIds);

        const variantsByBatch: Record<string, any[]> = {};
        for (const v of (variantsData || []) as any[]) {
          if (!variantsByBatch[v.batch_id]) variantsByBatch[v.batch_id] = [];
          variantsByBatch[v.batch_id].push(v);
        }

        for (const b of bofBatches as any[]) {
          const variants = variantsByBatch[b.id] || [];
          const completedCount = variants.filter((v: any) => v.status === "completed").length;
          unified.push({
            id: b.id,
            source: "bof",
            module: "bof_videos",
            title: b.product_name || "BOF Video",
            status: b.status,
            preview_url: b.product_image_url || "",
            created_at: b.created_at,
            raw: { ...b, variants },
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load BOF history:", e);
    }

    // 2. Analysis history (with timeout protection)
    try {
      const { data: analysisData, error: analysisErr } = await supabase
        .from("analysis_history")
        .select("id, tiktok_url, created_at, variant_count")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!analysisErr && analysisData) {
        for (const a of analysisData as any[]) {
          unified.push({
            id: a.id,
            source: "analysis",
            module: "video_variants",
            title: a.tiktok_url ? `Video Variants — ${a.tiktok_url.substring(0, 50)}` : "Video Variants",
            status: "completed",
            preview_url: "",
            created_at: a.created_at,
            raw: a,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load analysis history:", e);
    }

    // 3. B-Roll Lab history
    try {
      const { data: brollData } = await supabase
        .from("broll_lab_history" as any)
        .select("id, created_at, product_image_url, pipeline_step, variant_count")
        .order("created_at", { ascending: false })
        .limit(30);

      if (brollData) {
        for (const br of brollData as any[]) {
          unified.push({
            id: br.id,
            source: "broll_lab",
            module: "broll_lab",
            title: `B-Roll Lab — ${br.variant_count || 0} variantes`,
            status: br.pipeline_step === "done" ? "completed" : br.pipeline_step || "pending",
            preview_url: br.product_image_url || "",
            created_at: br.created_at,
            raw: br,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load B-Roll history:", e);
    }

    // 4. Unified generation_history
    try {
      const { data: genData } = await supabase
        .from("generation_history" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (genData) {
        for (const g of genData as any[]) {
          // Avoid duplicates if same job_id exists in other sources
          unified.push({
            id: g.id,
            source: "generation_history",
            module: g.module || "unknown",
            title: g.title || `Job ${g.job_id}`,
            status: g.status,
            preview_url: g.preview_url || "",
            created_at: g.created_at,
            raw: g,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load generation_history (table may not exist yet):", e);
    }

    // Sort all by date descending
    unified.sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

    setEntries(unified);
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (filterModule !== "all" && entry.module !== filterModule) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return entry.title.toLowerCase().includes(q) || entry.module.toLowerCase().includes(q);
    }
    return true;
  });

  // Module counts
  const moduleCounts = entries.reduce((acc, e) => {
    acc[e.module] = (acc[e.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeModules = Object.keys(moduleCounts).sort();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">
          Todo lo ejecutado en la plataforma. Descarga, retoma o reutiliza cualquier ejecución.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, módulo..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={filterModule === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterModule("all")}
            className="text-xs"
          >
            Todo ({entries.length})
          </Button>
          {activeModules.map(mod => {
            const info = MODULE_ICONS[mod];
            const Icon = info?.icon || Clock;
            return (
              <Button
                key={mod}
                variant={filterModule === mod ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterModule(mod)}
                className="text-xs gap-1"
              >
                <Icon className="h-3 w-3" />
                {info?.label || mod} ({moduleCounts[mod]})
              </Button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "Sin resultados para esta búsqueda." : "Sin historial aún. Genera algo para verlo aquí."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const moduleInfo = MODULE_ICONS[entry.module];
            const ModIcon = moduleInfo?.icon || Clock;

            return (
              <div key={`${entry.source}-${entry.id}`} className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-foreground/10">
                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Preview thumbnail */}
                  {entry.preview_url ? (
                    <img
                      src={entry.preview_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ModIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate max-w-[300px]">
                        {entry.title}
                      </p>
                      <Badge variant="outline" className="text-[9px] gap-0.5">
                        <ModIcon className="h-2.5 w-2.5" />
                        {moduleInfo?.label || entry.module}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusLabel status={entry.status} />
                      <span className="text-[10px] text-muted-foreground">{formatDate(entry.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Resume button for BOF awaiting approval */}
                    {entry.source === "bof" && entry.status === "awaiting_approval" && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => navigate(`/create/bof-videos?resume=${entry.id}`)}
                      >
                        <RotateCcw className="h-3 w-3" /> Retomar
                      </Button>
                    )}

                    {/* Resume for B-Roll Lab incomplete */}
                    {entry.source === "broll_lab" && entry.status !== "completed" && entry.status !== "done" && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => navigate(`/create/broll-lab?resume=${entry.id}`)}
                      >
                        <RotateCcw className="h-3 w-3" /> Retomar
                      </Button>
                    )}

                    {/* Download for BOF completed videos */}
                    {entry.source === "bof" && entry.status === "completed" && (
                      <BofQuickDownload variants={entry.raw.variants || []} productName={entry.title} />
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(entry.id)}
                      className="h-7 text-[10px] gap-1"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isExpanded ? "Cerrar" : "Detalle"}
                    </Button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4">
                    <ExpandedDetail entry={entry} />
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

// ─── Quick Download for BOF ──────────────────────────────────

function BofQuickDownload({ variants, productName }: { variants: any[]; productName: string }) {
  const completedWithVideo = variants.filter((v: any) => v.final_video_url || v.raw_video_url);
  if (completedWithVideo.length === 0) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-[10px] gap-1"
      onClick={() => {
        completedWithVideo.forEach((v: any, i: number) => {
          downloadFile(v.final_video_url || v.raw_video_url, `${productName}_v${i + 1}.mp4`);
        });
      }}
    >
      <Download className="h-3 w-3" /> {completedWithVideo.length} video{completedWithVideo.length > 1 ? "s" : ""}
    </Button>
  );
}

// ─── Expanded Detail ─────────────────────────────────────────

function ExpandedDetail({ entry }: { entry: UnifiedEntry }) {
  if (entry.source === "bof") return <BofExpandedDetail raw={entry.raw} />;
  if (entry.source === "analysis") return <AnalysisExpandedDetail raw={entry.raw} />;
  if (entry.source === "broll_lab") return <BrollLabExpandedDetail raw={entry.raw} />;
  if (entry.source === "generation_history") return <GenHistoryExpandedDetail raw={entry.raw} />;
  return <p className="text-xs text-muted-foreground">Sin detalle disponible.</p>;
}

// ─── BOF Expanded ────────────────────────────────────────────

function BofExpandedDetail({ raw }: { raw: any }) {
  const variants = (raw.variants || []) as BofVariantRow[];

  return (
    <div className="space-y-4">
      {/* Product info */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border/50">
        {raw.product_image_url && (
          <img src={raw.product_image_url} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{raw.product_name}</p>
          {raw.metadata_json?.current_price && (
            <p className="text-xs text-foreground">
              ${raw.metadata_json.current_price}
              {raw.metadata_json.old_price && (
                <span className="text-muted-foreground line-through ml-2">${raw.metadata_json.old_price}</span>
              )}
            </p>
          )}
          {raw.metadata_json?.main_benefit && <p className="text-[10px] text-muted-foreground">{raw.metadata_json.main_benefit}</p>}
        </div>
      </div>

      {/* Variants grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {variants.map((v, idx) => (
          <div key={v.id} className="rounded-lg border border-border/60 bg-card/80 overflow-hidden">
            {(v.final_video_url || v.raw_video_url) ? (
              <div className="relative aspect-[9/16] max-h-[200px] bg-black">
                <video src={v.final_video_url || v.raw_video_url || ""} className="w-full h-full object-contain" controls playsInline preload="metadata" />
              </div>
            ) : v.generated_image_url ? (
              <div className="relative aspect-[9/16] max-h-[200px]">
                <img src={v.generated_image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : null}
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[9px]">{v.format_id}</Badge>
                <StatusLabel status={v.status} />
              </div>
              {v.script_text && <p className="text-[10px] text-muted-foreground line-clamp-2">{v.script_text}</p>}
              {v.error_message && <p className="text-[10px] text-destructive">{v.error_message}</p>}
              {(v.final_video_url || v.raw_video_url) && (
                <Button size="sm" variant="outline" className="w-full h-6 text-[10px]"
                  onClick={() => downloadFile(v.final_video_url || v.raw_video_url!, `bof_v${idx + 1}.mp4`)}>
                  <Download className="h-2.5 w-2.5 mr-1" /> Descargar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analysis Expanded ───────────────────────────────────────

function AnalysisExpandedDetail({ raw }: { raw: any }) {
  return (
    <div className="space-y-3">
      {raw.tiktok_url && (
        <a href={raw.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> {raw.tiktok_url}
        </a>
      )}
      <p className="text-xs text-muted-foreground">
        {raw.variant_count || 0} variantes generadas. Abre Video Variants para ver detalles completos.
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.href = "/create/video"} className="text-xs gap-1">
        <Video className="h-3 w-3" /> Ir a Video Variants
      </Button>
    </div>
  );
}

// ─── B-Roll Lab Expanded ─────────────────────────────────────

function BrollLabExpandedDetail({ raw }: { raw: any }) {
  return (
    <div className="space-y-3">
      {raw.product_image_url && !raw.product_image_url.startsWith("data:") && (
        <img src={raw.product_image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
      )}
      <p className="text-xs text-muted-foreground">
        {raw.variant_count || 0} variantes de voz · Paso: {raw.pipeline_step || "desconocido"}
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.href = "/create/broll-lab"} className="text-xs gap-1">
        <FlaskConical className="h-3 w-3" /> Ir a B-Roll Lab
      </Button>
    </div>
  );
}

// ─── Generation History Expanded ─────────────────────────────

function GenHistoryExpandedDetail({ raw }: { raw: HistoryRecord }) {
  return (
    <div className="space-y-3">
      {raw.current_step && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Último paso:</span> {raw.current_step}
        </div>
      )}

      {raw.error_summary && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {raw.error_summary}
        </div>
      )}

      {raw.effective_prompt && (
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Prompt</span>
          <p className="text-[10px] text-foreground bg-muted/30 rounded-lg p-2 font-mono whitespace-pre-wrap line-clamp-6">
            {raw.effective_prompt}
          </p>
        </div>
      )}

      {raw.provider_used && (
        <Badge variant="outline" className="text-[9px]">Provider: {raw.provider_used}</Badge>
      )}

      {raw.output_summary_json && (
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Outputs</span>
          {(raw.output_summary_json as any)?.video_url && (
            <div className="space-y-2">
              <video src={(raw.output_summary_json as any).video_url} controls className="w-full max-w-sm rounded-lg" />
              <Button size="sm" variant="outline" className="text-[10px] gap-1"
                onClick={() => downloadFile((raw.output_summary_json as any).video_url, `output_${raw.job_id}.mp4`)}>
                <Download className="h-3 w-3" /> Descargar Video
              </Button>
            </div>
          )}
        </div>
      )}

      {raw.input_summary_json && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver inputs</summary>
          <pre className="mt-1 bg-muted/30 rounded-lg p-2 overflow-auto text-[9px] font-mono">
            {JSON.stringify(raw.input_summary_json, null, 2)}
          </pre>
        </details>
      )}

      {raw.source_route && (
        <Button size="sm" variant="outline" onClick={() => window.location.href = raw.source_route!} className="text-xs gap-1">
          <RotateCcw className="h-3 w-3" /> Ir al módulo
        </Button>
      )}
    </div>
  );
}
