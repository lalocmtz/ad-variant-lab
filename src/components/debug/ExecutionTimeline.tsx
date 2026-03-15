import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, Loader2, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LogEntry {
  id: string;
  job_id: string;
  module: string;
  stage: string;
  provider: string | null;
  status: string;
  message: string | null;
  raw_error: string | null;
  request_payload_json: Record<string, unknown> | null;
  response_payload_json: Record<string, unknown> | null;
  prompt_text: string | null;
  created_at: string;
}

interface ExecutionTimelineProps {
  jobId: string;
  refreshTrigger?: number;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; cls: string }> = {
  started: { icon: Clock, cls: "text-blue-500" },
  trying: { icon: Loader2, cls: "text-yellow-500 animate-spin" },
  queued: { icon: CheckCircle2, cls: "text-green-500" },
  success: { icon: CheckCircle2, cls: "text-green-600" },
  completed: { icon: CheckCircle2, cls: "text-green-600" },
  failed: { icon: AlertTriangle, cls: "text-destructive" },
  all_failed: { icon: AlertTriangle, cls: "text-destructive" },
  skipped: { icon: SkipForward, cls: "text-muted-foreground" },
};

const PROVIDER_COLORS: Record<string, string> = {
  sora: "bg-blue-500/10 text-blue-600",
  fal: "bg-purple-500/10 text-purple-600",
  kling: "bg-orange-500/10 text-orange-600",
};

const ExecutionTimeline = ({ jobId, refreshTrigger }: ExecutionTimelineProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("generation_logs")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (!error && data) setLogs(data as unknown as LogEntry[]);
    } catch (e) {
      console.warn("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs, refreshTrigger]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!jobId) return null;
  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando logs...
      </div>
    );
  }
  if (logs.length === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Diagnóstico de Ejecución
        </span>
        <button onClick={fetchLogs} className="text-[9px] text-primary hover:underline">
          Refrescar
        </button>
      </div>

      {logs.map((log) => {
        const config = STATUS_CONFIG[log.status] || STATUS_CONFIG.started;
        const Icon = config.icon;
        const isExpanded = expandedIds.has(log.id);
        const hasDetails = log.raw_error || log.response_payload_json || log.prompt_text;
        const time = new Date(log.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        return (
          <div key={log.id} className="border-l-2 border-border pl-3 py-1">
            <div
              className={`flex items-start gap-2 ${hasDetails ? "cursor-pointer" : ""}`}
              onClick={() => hasDetails && toggleExpand(log.id)}
            >
              <Icon className={`h-3 w-3 mt-0.5 shrink-0 ${config.cls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">{time}</span>
                  {log.provider && (
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${PROVIDER_COLORS[log.provider] || "bg-muted text-muted-foreground"}`}>
                      {log.provider}
                    </span>
                  )}
                  <span className="text-[10px] text-foreground">{log.message || log.status}</span>
                  {hasDetails && (
                    isExpanded
                      ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                      : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {isExpanded && hasDetails && (
              <div className="mt-1 ml-5 space-y-1">
                {log.raw_error && (
                  <div className="rounded bg-destructive/5 border border-destructive/20 p-2">
                    <p className="text-[9px] font-semibold text-destructive mb-0.5">Raw Error</p>
                    <pre className="text-[9px] text-destructive/80 whitespace-pre-wrap break-all font-mono">
                      {log.raw_error.substring(0, 1000)}
                    </pre>
                  </div>
                )}
                {log.response_payload_json && (
                  <div className="rounded bg-muted/50 border border-border p-2">
                    <p className="text-[9px] font-semibold text-muted-foreground mb-0.5">Response Payload</p>
                    <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap break-all font-mono max-h-32 overflow-y-auto">
                      {JSON.stringify(log.response_payload_json, null, 2).substring(0, 2000)}
                    </pre>
                  </div>
                )}
                {log.prompt_text && (
                  <div className="rounded bg-muted/50 border border-border p-2">
                    <p className="text-[9px] font-semibold text-muted-foreground mb-0.5">Prompt Used</p>
                    <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">
                      {log.prompt_text.substring(0, 1000)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExecutionTimeline;
