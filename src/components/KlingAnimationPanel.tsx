import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { VariantResult } from "@/pages/Index";

interface AnimationTask {
  variantIndex: number;
  taskId: string | null;
  status: "pending" | "submitting" | "processing" | "completed" | "failed";
  videoUrl: string;
  error?: string;
}

interface KlingAnimationPanelProps {
  variants: VariantResult[];
  videoUrl: string;
}

const POLL_INTERVAL = 12000;

const KlingAnimationPanel = ({ variants, videoUrl }: KlingAnimationPanelProps) => {
  const [count, setCount] = useState("1");
  const [tasks, setTasks] = useState<AnimationTask[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(clearInterval);
    };
  }, []);

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

      if (status === "completed" || status === "succeed" || status === "success") {
        clearInterval(intervalRefs.current[variantIndex]);
        delete intervalRefs.current[variantIndex];
        setTasks((prev) =>
          prev.map((t) =>
            t.variantIndex === variantIndex
              ? { ...t, status: "completed", videoUrl: data.video_url }
              : t
          )
        );
      } else if (status === "failed" || status === "error") {
        clearInterval(intervalRefs.current[variantIndex]);
        delete intervalRefs.current[variantIndex];
        setTasks((prev) =>
          prev.map((t) =>
            t.variantIndex === variantIndex
              ? { ...t, status: "failed", error: "La tarea falló en Kling" }
              : t
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
      .filter((v) => v.generated_image_url)
      .slice(0, numVideos);

    if (eligibleVariants.length === 0) {
      toast.error("No hay imágenes generadas para animar");
      return;
    }

    setIsAnimating(true);

    // Initialize tasks
    const newTasks: AnimationTask[] = eligibleVariants.map((_, i) => ({
      variantIndex: i,
      taskId: null,
      status: "submitting",
      videoUrl: "",
    }));
    setTasks(newTasks);

    // Submit each task
    for (let i = 0; i < eligibleVariants.length; i++) {
      const variant = eligibleVariants[i];
      try {
        const { data, error } = await supabase.functions.invoke("animate-kling", {
          body: {
            image_url: variant.generated_image_url,
            video_url: videoUrl,
          },
        });

        if (error || !data?.taskId) {
          setTasks((prev) =>
            prev.map((t) =>
              t.variantIndex === i
                ? { ...t, status: "failed", error: data?.error || error?.message || "Error enviando tarea" }
                : t
            )
          );
          continue;
        }

        setTasks((prev) =>
          prev.map((t) =>
            t.variantIndex === i
              ? { ...t, taskId: data.taskId, status: "processing" }
              : t
          )
        );

        // Start polling
        intervalRefs.current[i] = setInterval(() => pollTask(data.taskId, i), POLL_INTERVAL);
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) =>
            t.variantIndex === i
              ? { ...t, status: "failed", error: e instanceof Error ? e.message : "Error desconocido" }
              : t
          )
        );
      }
    }
  }, [count, variants, videoUrl, pollTask]);

  const retryTask = useCallback(async (variantIndex: number) => {
    const variant = variants.filter((v) => v.generated_image_url)[variantIndex];
    if (!variant) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.variantIndex === variantIndex ? { ...t, status: "submitting", error: undefined } : t
      )
    );

    try {
      const { data, error } = await supabase.functions.invoke("animate-kling", {
        body: { image_url: variant.generated_image_url, video_url: videoUrl },
      });

      if (error || !data?.taskId) {
        setTasks((prev) =>
          prev.map((t) =>
            t.variantIndex === variantIndex
              ? { ...t, status: "failed", error: data?.error || "Error reenviando" }
              : t
          )
        );
        return;
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.variantIndex === variantIndex ? { ...t, taskId: data.taskId, status: "processing" } : t
        )
      );
      intervalRefs.current[variantIndex] = setInterval(() => pollTask(data.taskId, variantIndex), POLL_INTERVAL);
    } catch (e) {
      setTasks((prev) =>
        prev.map((t) =>
          t.variantIndex === variantIndex
            ? { ...t, status: "failed", error: e instanceof Error ? e.message : "Error" }
            : t
        )
      );
    }
  }, [variants, videoUrl, pollTask]);

  const maxCount = Math.min(5, variants.filter((v) => v.generated_image_url).length);

  return (
    <div className="space-y-6 rounded-xl border border-border/50 bg-card p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">
          Animar Variantes (Kling Motion)
        </h3>
        <p className="text-sm text-muted-foreground">
          Genera videos animados usando el movimiento del video original de TikTok.
        </p>
      </div>

      {tasks.length === 0 && (
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ¿Cuántos videos generar?
            </label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxCount }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {i + 1} video{i > 0 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={startAnimation} disabled={isAnimating || maxCount === 0}>
            <Play className="h-4 w-4" />
            Animar Variantes
          </Button>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <div
              key={task.variantIndex}
              className="overflow-hidden rounded-lg border border-border/50 bg-muted/30"
            >
              {task.status === "completed" && task.videoUrl ? (
                <video
                  src={task.videoUrl}
                  controls
                  className="aspect-[9/16] w-full object-cover"
                />
              ) : task.status === "failed" ? (
                <div className="flex aspect-[9/16] flex-col items-center justify-center gap-3 p-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-center text-sm text-destructive">
                    {task.error || "Error desconocido"}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => retryTask(task.variantIndex)}>
                    <RefreshCw className="h-3 w-3" />
                    Reintentar
                  </Button>
                </div>
              ) : (
                <div className="flex aspect-[9/16] flex-col items-center justify-center gap-3 p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Animando variante {task.variantIndex + 1}...
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {task.status === "submitting" ? "Enviando..." : "Procesando en Kling..."}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KlingAnimationPanel;
