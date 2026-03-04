import { useState, useEffect } from "react";
import { Clock, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisResult } from "@/pages/Index";

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string;
  variant_count: number;
  results: AnalysisResult;
}

interface HistoryPanelProps {
  onLoadResult: (results: AnalysisResult) => void;
}

const HistoryPanel = ({ onLoadResult }: HistoryPanelProps) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from("analysis_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setEntries(data as unknown as HistoryEntry[]);
      }
      setLoading(false);
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No hay análisis previos</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const date = new Date(entry.created_at);
        const truncatedUrl = entry.tiktok_url.length > 50
          ? entry.tiktok_url.substring(0, 50) + "..."
          : entry.tiktok_url;

        return (
          <button
            key={entry.id}
            onClick={() => onLoadResult(entry.results)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-3 w-3 shrink-0 text-primary" />
                <span className="truncate font-mono text-xs text-foreground">
                  {truncatedUrl}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</span>
                <span>{date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                  {entry.variant_count} variantes
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default HistoryPanel;
