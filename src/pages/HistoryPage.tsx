import { useState, useEffect } from "react";
import { Video, Image, Download, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: any;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "static">("all");

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

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">History</h1>
          <p className="text-sm text-muted-foreground">All your generated variants in one place.</p>
        </div>
        <div className="flex gap-1">
          {(["all", "video", "static"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
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
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          {entries.map((entry, i) => {
            const coverUrl = entry.results?.variants?.[0]?.generated_image_url;
            const date = entry.created_at ? new Date(entry.created_at) : null;
            const variantCount = entry.variant_count || entry.results?.variants?.length || 0;

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors ${
                  i < entries.length - 1 ? "border-b border-border" : ""
                }`}
              >
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
                <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
