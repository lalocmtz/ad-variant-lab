import { useState, useEffect } from "react";
import { Video, Image, Clock, Loader2, ChevronDown, ChevronUp, ExternalLink, Copy, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface Variant {
  variant_id?: string;
  hook_text?: string;
  generated_image_url?: string;
  video_url?: string;
  video_status?: string;
  prompt_package?: {
    prompt_text?: string;
    prompt_json?: Record<string, unknown>;
  };
  script_variant?: {
    hook?: string;
    full_script?: string;
  };
  [key: string]: any;
}

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: { variants?: Variant[]; [key: string]: any } | null;
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Prompt copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-auto shrink-0" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 relative">
          <pre className="text-[10px] leading-relaxed text-muted-foreground bg-muted/50 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-border">
            {text}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="absolute top-1 right-1 h-6 w-6 p-0"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
                      {variants.map((v, idx) => {
                        const promptText = v.prompt_package?.prompt_text;
                        const hookText = v.script_variant?.hook || v.hook_text;

                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-border bg-card overflow-hidden"
                          >
                            {/* Image */}
                            {v.generated_image_url && (
                              <img
                                src={v.generated_image_url}
                                alt={hookText || `Variant ${idx + 1}`}
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
                            <div className="p-3 space-y-3">
                              {hookText && (
                                <p className="text-xs font-medium text-foreground line-clamp-2">
                                  {hookText}
                                </p>
                              )}

                              {/* Asset links */}
                              <div className="flex flex-wrap gap-2">
                                {v.generated_image_url && (
                                  <a
                                    href={v.generated_image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Image className="h-3 w-3" />
                                    Imagen
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                {v.video_url && (
                                  <a
                                    href={v.video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Video className="h-3 w-3" />
                                    Descargar video
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                {!v.video_url && (
                                  <span className="text-[10px] text-muted-foreground italic">Sin video generado</span>
                                )}
                              </div>

                              {/* Prompt block */}
                              {promptText && (
                                <PromptBlock label="Animation Prompt (Sora/Kling)" text={promptText} />
                              )}
                            </div>
                          </div>
                        );
                      })}
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