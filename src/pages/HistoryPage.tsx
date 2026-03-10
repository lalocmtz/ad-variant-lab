import { useState, useEffect, useCallback } from "react";
import { Video, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VariantCard from "@/components/VariantCard";
import type { VariantResult, VideoGenerationStatus, VariantStatus } from "@/pages/Index";

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: { variants?: VariantResult[]; [key: string]: any } | null;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("analysis_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setEntries(data as HistoryEntry[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const toggle = (id: string) => setExpandedId(prev => (prev === id ? null : id));

  // Persist variant video state changes back to analysis_history
  const handleVideoStateChange = useCallback(async (
    entryId: string,
    variantIndex: number,
    videoState: { video_task_id?: string; video_status?: VideoGenerationStatus; video_url?: string; video_error?: string; video_mode?: string }
  ) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId || !entry.results?.variants) return entry;
      const updatedVariants = [...entry.results.variants];
      updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], ...videoState };
      return { ...entry, results: { ...entry.results, variants: updatedVariants } };
    }));

    // Also persist to DB
    const entry = entries.find(e => e.id === entryId);
    if (!entry?.results?.variants) return;
    const updatedVariants = [...entry.results.variants];
    updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], ...videoState };
    const updatedResults = { ...entry.results, variants: updatedVariants };

    await supabase
      .from("analysis_history")
      .update({ results: updatedResults as any })
      .eq("id", entryId);
  }, [entries]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">Todas tus variantes generadas. Haz clic en "Ver variantes" para regenerar videos.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No history yet. Start generating variants to see them here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const variants = (entry.results?.variants || []) as VariantResult[];
            const coverUrl = variants[0]?.generated_image_url;
            const date = entry.created_at ? new Date(entry.created_at) : null;
            const variantCount = entry.variant_count || variants.length || 0;
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
              >
                {/* Row header */}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggle(entry.id)}
                    className="gap-1.5 text-xs"
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Ocultar" : "Ver variantes"}
                  </Button>
                </div>

                {/* Expanded panel — full VariantCard with video generation */}
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
                          onVideoStateChange={(videoState) => handleVideoStateChange(entry.id, idx, videoState)}
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