import { useState, useEffect } from "react";
import { Video, Image, Clock, Loader2, ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Variant {
  hook_text?: string;
  generated_image_url?: string;
  video_url?: string;
  video_status?: string;
  [key: string]: any;
}

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: { variants?: Variant[]; [key: string]: any } | null;
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

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">All your generated variants in one place.</p>
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
            const variants = entry.results?.variants || [];
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

                {/* Expanded panel */}
                {isExpanded && variants.length > 0 && (
                  <div className="border-t border-border bg-muted/20 px-5 py-5">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {variants.map((v, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-border bg-card overflow-hidden"
                        >
                          {/* Image */}
                          {v.generated_image_url && (
                            <img
                              src={v.generated_image_url}
                              alt={v.hook_text || `Variant ${idx + 1}`}
                              className="w-full aspect-[9/16] object-cover"
                            />
                          )}

                          {/* Video */}
                          {v.video_url && (
                            <video
                              src={v.video_url}
                              controls
                              className="w-full aspect-video bg-black"
                              preload="metadata"
                            />
                          )}

                          {/* Info + actions */}
                          <div className="p-3 space-y-2">
                            {v.hook_text && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {v.hook_text}
                              </p>
                            )}
                            <div className="flex gap-2">
                              {v.generated_image_url && (
                                <a
                                  href={v.generated_image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <Image className="h-3 w-3" />
                                  Image
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                              {v.video_url && (
                                <a
                                  href={v.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <Video className="h-3 w-3" />
                                  Video
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {variants.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No variants found for this entry.
                      </p>
                    )}
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
