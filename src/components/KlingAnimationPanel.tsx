import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Loader2, RefreshCw, AlertCircle, Scissors, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import VideoTrimmerDialog from "@/components/VideoTrimmerDialog";
import type { VariantResult } from "@/pages/Index";

interface AnimationTask {
  variantIndex: number;
  taskId: string | null;
  status: "pending" | "submitting" | "processing" | "completed" | "failed";
  videoUrl: string;
  error?: string;
  startTime?: number;
  detailState?: string;
}

interface KlingAnimationPanelProps {
  variants: VariantResult[];
  videoUrl: string;
  videoDuration?: number;
}

const POLL_INTERVAL = 12000;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const STATE_LABELS: Record<string, string> = {
  waiting: "En cola de espera...",
  queuing: "En cola de procesamiento...",
  generating: "Generando video...",
  processing: "Procesando...",
  unknown: "Procesando...",
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const KlingAnimationPanel = ({ variants, videoUrl, videoDuration }: KlingAnimationPanelProps) => {
  const isTooLong = videoDuration !== undefined && videoDuration > 30;
  const [count, setCount] = useState("1");
  const [tasks, setTasks] = useState<AnimationTask[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimmedVideoUrl, setTrimmedVideoUrl] = useState<string | null>(null);
  const [trimmedDuration, setTrimmedDuration] = useState<number | null>(null);
  const [, setTick] = useState(0); // force re-render for timer
  const intervalRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer tick for elapsed display
  useEffect(() => {
    const hasProcessing = tasks.some(t => t.status === "processing" || t.status === "submitting");
    if (hasProcessing && !timerRef.current) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else if (!hasProcessing && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [tasks]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(clearInterval);
    };
  }, []);

  const pollTask = useCallback(async (taskId: string, variantIndex: number) => {
    // Check timeout
    setTasks(prev => {
      const task = prev.find(t => t.variantIndex === variantIndex);
      if (task?.startTime && Date.now() - task.startTime > TIMEOUT_MS) {
        clearInterval(intervalRefs.current[variantIndex]);
        delete intervalRefs.current[variantIndex];
        return prev.map(t =>
          t.variantIndex === variantIndex
            ? { ...t, status: "failed" as const, error: "Tiempo de espera agotado (10 min). La tarea sigue en cola en el servidor. Puedes reintentar." }
            : t
        );
      }
      return prev;
    });

    try {
      const { data, error } = await supabase.functions.invoke("poll-kling", {
        body: { taskId },
      });

      if (error) {
        console.error(`Poll error for variant ${variantIndex}:`, error);
        return;
      }

      const status = data.status?.toLowerCase();
      const detailState = data.detail_state || "unknown";

      if (status === "completed" || status === "succeed" || status === "success") {
        clearInterval(intervalRefs.current[variantIndex]);
        delete intervalRefs.current[variantIndex];
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex
              ? { ...t, status: "completed", videoUrl: data.video_url, detailState }
              : t
          )
        );
      } else if (status === "failed" || status === "error") {
        clearInterval(intervalRefs.current[variantIndex]);
        delete intervalRefs.current[variantIndex];
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex
              ? { ...t, status: "failed", error: "La tarea falló en Kling", detailState }
              : t
          )
        );
      } else {
        // Update detail state for UI
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex ? { ...t, detailState } : t
          )
        );
      }
    } catch (e) {
      console.error(`Poll exception for variant ${variantIndex}:`, e);
    }
  }, []);

  const startAnimation = useCallback(async () => {
    const numVideos = parseInt(count);
    const eligibleVariants = variants
      .filter(v => v.generated_image_url)
      .slice(0, numVideos);

    if (eligibleVariants.length === 0) {
      toast.error("No hay imágenes generadas para animar");
      return;
    }

    setIsAnimating(true);
    const now = Date.now();

    const newTasks: AnimationTask[] = eligibleVariants.map((_, i) => ({
      variantIndex: i,
      taskId: null,
      status: "submitting",
      videoUrl: "",
      startTime: now,
    }));
    setTasks(newTasks);

    for (let i = 0; i < eligibleVariants.length; i++) {
      const variant = eligibleVariants[i];
      try {
        const activeVideoUrl = trimmedVideoUrl || videoUrl;
        const activeDuration = trimmedDuration || videoDuration;
        const { data, error } = await supabase.functions.invoke("animate-kling", {
          body: {
            image_url: variant.generated_image_url,
            video_url: activeVideoUrl,
            video_duration: activeDuration,
          },
        });

        if (error || !data?.taskId) {
          let errorMsg = "Error enviando tarea";
          if (data?.error) errorMsg = data.error;
          else if (error?.message) {
            try { errorMsg = JSON.parse(error.message).error || error.message; } catch { errorMsg = error.message; }
          }
          setTasks(prev =>
            prev.map(t => t.variantIndex === i ? { ...t, status: "failed", error: errorMsg } : t)
          );
          continue;
        }

        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === i
              ? { ...t, taskId: data.taskId, status: "processing", startTime: Date.now() }
              : t
          )
        );

        intervalRefs.current[i] = setInterval(() => pollTask(data.taskId, i), POLL_INTERVAL);
      } catch (e) {
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === i
              ? { ...t, status: "failed", error: e instanceof Error ? e.message : "Error desconocido" }
              : t
          )
        );
      }
    }
  }, [count, variants, videoUrl, trimmedVideoUrl, trimmedDuration, videoDuration, pollTask]);

  const retryTask = useCallback(async (variantIndex: number) => {
    const variant = variants.filter(v => v.generated_image_url)[variantIndex];
    if (!variant) return;

    setTasks(prev =>
      prev.map(t =>
        t.variantIndex === variantIndex ? { ...t, status: "submitting", error: undefined, startTime: Date.now() } : t
      )
    );

    try {
      const activeVideoUrl = trimmedVideoUrl || videoUrl;
      const activeDuration = trimmedDuration || videoDuration;
      const { data, error } = await supabase.functions.invoke("animate-kling", {
        body: { image_url: variant.generated_image_url, video_url: activeVideoUrl, video_duration: activeDuration },
      });

      if (error || !data?.taskId) {
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex
              ? { ...t, status: "failed", error: data?.error || "Error reenviando" }
              : t
          )
        );
        return;
      }

      setTasks(prev =>
        prev.map(t =>
          t.variantIndex === variantIndex ? { ...t, taskId: data.taskId, status: "processing", startTime: Date.now() } : t
        )
      );
      intervalRefs.current[variantIndex] = setInterval(() => pollTask(data.taskId, variantIndex), POLL_INTERVAL);
    } catch (e) {
      setTasks(prev =>
        prev.map(t =>
          t.variantIndex === variantIndex
            ? { ...t, status: "failed", error: e instanceof Error ? e.message : "Error" }
            : t
        )
      );
    }
  }, [variants, videoUrl, trimmedVideoUrl, trimmedDuration, videoDuration, pollTask]);

  const maxCount = Math.min(5, variants.filter(v => v.generated_image_url).length);

  return (
    <div className="space-y-6 rounded-xl border border-border/50 bg-card p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Animar Variantes (Kling Motion)</h3>
        <p className="text-sm text-muted-foreground">
          Genera videos animados usando el movimiento del video original de TikTok.
        </p>
      </div>

      <VideoTrimmerDialog
        open={showTrimmer}
        onClose={() => setShowTrimmer(false)}
        videoUrl={videoUrl}
        videoDuration={videoDuration || 0}
        onTrimmed={(url, dur) => { setTrimmedVideoUrl(url); setTrimmedDuration(dur); }}
      />

      {isTooLong && !trimmedVideoUrl && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">Video demasiado largo ({Math.round(videoDuration!)}s)</p>
              <p className="text-xs text-muted-foreground">Kling solo acepta videos de 3 a 30 segundos. Recorta el video para continuar.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowTrimmer(true)} className="shrink-0">
            <Scissors className="h-4 w-4" /> Recortar
          </Button>
        </div>
      )}

      {trimmedVideoUrl && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 text-primary shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Video recortado ({Math.round(trimmedDuration!)}s)</p>
              <p className="text-xs text-muted-foreground">Listo para animar.</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowTrimmer(true)} className="shrink-0 text-xs">
            Cambiar recorte
          </Button>
        </div>
      )}

      {(!isTooLong || trimmedVideoUrl) && tasks.length === 0 && (
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">¿Cuántos videos generar?</label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxCount }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} video{i > 0 ? "s" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={startAnimation} disabled={isAnimating || maxCount === 0}>
            <Play className="h-4 w-4" /> Animar Variantes
          </Button>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard key={task.variantIndex} task={task} onRetry={retryTask} />
          ))}
        </div>
      )}
    </div>
  );
};

function TaskCard({ task, onRetry }: { task: AnimationTask; onRetry: (i: number) => void }) {
  const isActive = task.status === "processing" || task.status === "submitting";
  const elapsed = isActive && task.startTime ? Date.now() - task.startTime : 0;
  const progressPercent = isActive ? Math.min(95, (elapsed / TIMEOUT_MS) * 100) : task.status === "completed" ? 100 : 0;
  const stateLabel = STATE_LABELS[task.detailState || "unknown"] || STATE_LABELS.unknown;

  if (task.status === "completed" && task.videoUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        <video src={task.videoUrl} controls className="aspect-[9/16] w-full object-cover" />
      </div>
    );
  }

  if (task.status === "failed") {
    return (
      <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        <div className="flex aspect-[9/16] flex-col items-center justify-center gap-3 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-center text-sm text-destructive">{task.error || "Error desconocido"}</p>
          <Button variant="outline" size="sm" onClick={() => onRetry(task.variantIndex)}>
            <RefreshCw className="h-3 w-3" /> Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <div className="flex aspect-[9/16] flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="w-full space-y-2 text-center">
          <p className="text-sm font-medium text-foreground">Variante {task.variantIndex + 1}</p>
          <p className="text-xs text-muted-foreground">{task.status === "submitting" ? "Enviando..." : stateLabel}</p>
          <Progress value={progressPercent} className="h-1.5 w-full" />
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            <span>{formatElapsed(elapsed)} / 10:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KlingAnimationPanel;
