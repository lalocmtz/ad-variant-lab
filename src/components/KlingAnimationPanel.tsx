import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Loader2, RefreshCw, AlertCircle, Scissors, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import VideoTrimmerDialog from "@/components/VideoTrimmerDialog";
import type { VariantResult } from "@/pages/Index";

interface AnimationTask {
  variantIndex: number;
  taskId: string | null;
  status: "pending" | "submitting" | "processing" | "merging_audio" | "completed" | "failed";
  videoUrl: string;
  error?: string;
  startTime?: number;
  detailState?: string;
}

interface KlingAnimationPanelProps {
  variants: VariantResult[];
  videoUrl: string;
  videoDuration?: number;
  videoMode?: "avatar" | "no_avatar";
}

const POLL_INTERVAL = 12000;

const STATE_LABELS: Record<string, string> = {
  waiting: "En cola de espera...",
  queuing: "En cola de procesamiento...",
  generating: "Generando video...",
  processing: "Procesando...",
  merging_audio: "Agregando audio del video original...",
  unknown: "Procesando...",
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const KlingAnimationPanel = ({ variants, videoUrl, videoDuration, videoMode = "avatar" }: KlingAnimationPanelProps) => {
  const isNoAvatar = videoMode === "no_avatar";
  const isTooLong = !isNoAvatar && videoDuration !== undefined && videoDuration > 30;
  const canAnimateDirectly = isNoAvatar || !isTooLong;
  const [count, setCount] = useState("1");
  const [tasks, setTasks] = useState<AnimationTask[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimmedVideoUrl, setTrimmedVideoUrl] = useState<string | null>(null);
  const [trimmedDuration, setTrimmedDuration] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const intervalRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const hasProcessing = tasks.some(t => t.status === "processing" || t.status === "submitting" || t.status === "merging_audio");
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

  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(clearInterval);
    };
  }, []);

  const mergeAudio = useCallback(async (klingVideoUrl: string, variantIndex: number) => {
    setTasks(prev =>
      prev.map(t =>
        t.variantIndex === variantIndex
          ? { ...t, status: "merging_audio" as const, detailState: "merging_audio" }
          : t
      )
    );

    try {
      const activeVideoUrl = trimmedVideoUrl || videoUrl;
      const { data, error } = await supabase.functions.invoke("merge-audio", {
        body: {
          kling_video_url: klingVideoUrl,
          original_video_url: activeVideoUrl,
        },
      });

      if (error) {
        console.error("merge-audio error:", error);
        // If merge fails, still show the silent video rather than failing completely
        toast.warning("No se pudo agregar audio. Video entregado sin audio.");
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex
              ? { ...t, status: "completed" as const, videoUrl: klingVideoUrl }
              : t
          )
        );
        return;
      }

      const finalUrl = data.merged_url || klingVideoUrl;
      setTasks(prev =>
        prev.map(t =>
          t.variantIndex === variantIndex
            ? { ...t, status: "completed" as const, videoUrl: finalUrl }
            : t
        )
      );
      
      if (data.had_audio) {
        toast.success(`Variante ${variantIndex + 1}: Video con audio listo`);
      }
    } catch (e) {
      console.error("merge-audio exception:", e);
      toast.warning("Error al agregar audio. Video entregado sin audio.");
      setTasks(prev =>
        prev.map(t =>
          t.variantIndex === variantIndex
            ? { ...t, status: "completed" as const, videoUrl: klingVideoUrl }
            : t
        )
      );
    }
  }, [videoUrl, trimmedVideoUrl]);

  const pollTask = useCallback(async (taskId: string, variantIndex: number) => {
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
        if (isNoAvatar) {
          // Sora mode: no audio merge needed
          setTasks(prev =>
            prev.map(t =>
              t.variantIndex === variantIndex
                ? { ...t, status: "completed" as const, videoUrl: data.video_url }
                : t
            )
          );
          toast.success(`Variante ${variantIndex + 1}: Video listo`);
        } else {
          // Kling mode: merge audio from original video
          mergeAudio(data.video_url, variantIndex);
        }
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
        setTasks(prev =>
          prev.map(t =>
            t.variantIndex === variantIndex ? { ...t, detailState } : t
          )
        );
      }
    } catch (e) {
      console.error(`Poll exception for variant ${variantIndex}:`, e);
    }
  }, [mergeAudio]);

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
        const body: Record<string, unknown> = {
          image_url: variant.generated_image_url,
          video_mode: videoMode,
        };
        if (isNoAvatar) {
          body.motion_prompt = (variant as any).hisfield_master_motion_prompt || "";
        } else {
          body.video_url = activeVideoUrl;
          body.video_duration = activeDuration;
        }
        const { data, error } = await supabase.functions.invoke("animate-kling", {
          body,
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
      const retryBody: Record<string, unknown> = {
        image_url: variant.generated_image_url,
        video_mode: videoMode,
      };
      if (isNoAvatar) {
        retryBody.motion_prompt = (variant as any).hisfield_master_motion_prompt || "";
      } else {
        retryBody.video_url = trimmedVideoUrl || videoUrl;
        retryBody.video_duration = trimmedDuration || videoDuration;
      }
      const { data, error } = await supabase.functions.invoke("animate-kling", {
        body: retryBody,
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
        <h3 className="text-lg font-semibold text-foreground">
          {isNoAvatar ? "Generar Video (Sora)" : "Animar Variantes (Kling Motion)"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isNoAvatar
            ? "Genera videos de producto animados a partir de las imágenes generadas."
            : "Genera videos animados usando el movimiento del video original de TikTok."}
        </p>
      </div>

      {!isNoAvatar && (
        <VideoTrimmerDialog
          open={showTrimmer}
          onClose={() => setShowTrimmer(false)}
          videoUrl={videoUrl}
          videoDuration={videoDuration || 0}
          onTrimmed={(url, dur) => { setTrimmedVideoUrl(url); setTrimmedDuration(dur); }}
        />
      )}

      {!isNoAvatar && isTooLong && !trimmedVideoUrl && (
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

      {!isNoAvatar && trimmedVideoUrl && (
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

      {!isNoAvatar && canAnimateDirectly && !trimmedVideoUrl && (
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/30 p-4">
          <Scissors className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">Video de {Math.round(videoDuration || 0)}s — listo para animar. También puedes recortarlo si lo deseas.</p>
          <Button variant="ghost" size="sm" onClick={() => setShowTrimmer(true)} className="shrink-0 text-xs">
            Recortar
          </Button>
        </div>
      )}

      {(canAnimateDirectly || trimmedVideoUrl) && tasks.length === 0 && (
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
            <Play className="h-4 w-4" /> {isNoAvatar ? "Generar Videos" : "Animar Variantes"}
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
  const isActive = task.status === "processing" || task.status === "submitting" || task.status === "merging_audio";
  const elapsed = isActive && task.startTime ? Date.now() - task.startTime : 0;
  const stateLabel = task.status === "merging_audio" 
    ? STATE_LABELS.merging_audio 
    : STATE_LABELS[task.detailState || "unknown"] || STATE_LABELS.unknown;

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
          {/* Indeterminate pulsing progress bar */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="absolute inset-0 h-full w-1/3 animate-pulse rounded-full bg-primary" 
                 style={{ animation: "indeterminate 1.5s ease-in-out infinite" }} />
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            <span>{formatElapsed(elapsed)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KlingAnimationPanel;
