import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Loader2, Download, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VariantResult, VideoGenerationStatus } from "@/pages/Index";

interface VariantCardProps {
  variant: VariantResult;
  language?: string;
  accent?: string;
  onRegenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onVideoStateChange?: (videoState: { video_task_id?: string; video_status?: VideoGenerationStatus; video_url?: string; video_error?: string; video_mode?: string }) => void;
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  ready: { label: "Listo", cls: "bg-primary/10 text-primary" },
  approved: { label: "Aprobado", cls: "bg-green-500/10 text-green-600" },
  rejected: { label: "Rechazado", cls: "bg-destructive/10 text-destructive" },
  needs_regeneration: { label: "Regenerar", cls: "bg-yellow-500/10 text-yellow-600" },
  pending: { label: "Generando...", cls: "bg-muted text-muted-foreground" },
};

const VIDEO_STATUS_CONFIG: Record<string, { label: string; showLoader?: boolean }> = {
  idle: { label: "Generar Video (15s)" },
  queued: { label: "En cola...", showLoader: true },
  processing: { label: "Generando video...", showLoader: true },
  completed: { label: "Video listo" },
  failed: { label: "Reintentar video" },
};

const POLL_INTERVAL_MS = 5000;

function handleDownloadImage(url: string, variantId: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `variant_${variantId}.png`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function handleDownloadVideo(url: string, variantId: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `video_${variantId}.mp4`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const VariantCard = ({ variant, language, accent, onRegenerate, onApprove, onReject, onVideoStateChange }: VariantCardProps) => {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [videoStatus, setVideoStatus] = useState<VideoGenerationStatus>(variant.video_status || "idle");
  const [videoTaskId, setVideoTaskId] = useState<string | undefined>(variant.video_task_id);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(variant.video_url);
  const [videoError, setVideoError] = useState<string | undefined>(variant.video_error);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const badge = STATUS_BADGES[variant.status] || STATUS_BADGES.ready;
  const isPending = variant.status === "pending";
  const promptText = variant.prompt_package?.prompt_text || "";

  const isVideoActive = videoStatus === "queued" || videoStatus === "processing";

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Sync from parent if props change
  useEffect(() => {
    if (variant.video_status && variant.video_status !== videoStatus) setVideoStatus(variant.video_status);
    if (variant.video_task_id && variant.video_task_id !== videoTaskId) setVideoTaskId(variant.video_task_id);
    if (variant.video_url && variant.video_url !== videoUrl) setVideoUrl(variant.video_url);
    if (variant.video_error !== undefined) setVideoError(variant.video_error);
  }, [variant.video_status, variant.video_task_id, variant.video_url, variant.video_error]);

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Polling logic
  const pollTask = useCallback(async (taskId: string) => {
    if (!isMountedRef.current) return;
    try {
      const { data, error } = await supabase.functions.invoke("get-video-task", {
        body: { taskId },
      });

      if (!isMountedRef.current) return;

      if (error) {
        console.error("Poll network error:", error.message);
        // Network errors - don't stop polling, might be transient
        return;
      }

      if (data?.error && data?.shouldStopPolling) {
        // Hard failure from backend - stop polling
        setVideoStatus("failed");
        setVideoError(data.error);
        onVideoStateChange?.({ video_task_id: taskId, video_status: "failed", video_error: data.error });
        toast.error(`Video ${variant.variant_id}: ${data.error}`);
        stopPolling();
        return;
      }

      const newStatus = data?.status as VideoGenerationStatus;
      if (!newStatus) return;

      setVideoStatus(newStatus);

      if (newStatus === "completed" && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setVideoError(undefined);
        onVideoStateChange?.({ video_task_id: taskId, video_status: "completed", video_url: data.videoUrl });
        toast.success(`Video ${variant.variant_id} generado exitosamente`);
        stopPolling();
      } else if (newStatus === "completed" && !data.videoUrl) {
        setVideoStatus("failed");
        setVideoError("El proveedor reportó éxito pero no devolvió URL de video.");
        onVideoStateChange?.({ video_task_id: taskId, video_status: "failed", video_error: "El proveedor reportó éxito pero no devolvió URL de video." });
        stopPolling();
      } else if (newStatus === "failed") {
        setVideoError(data.error || "La generación de video falló.");
        onVideoStateChange?.({ video_task_id: taskId, video_status: "failed", video_error: data.error });
        toast.error(`Video ${variant.variant_id}: ${data.error || "falló"}`);
        stopPolling();
      } else if (data.shouldStopPolling) {
        stopPolling();
      }
    } catch (e) {
      console.error("Poll exception:", e);
    }
  }, [variant.variant_id, onVideoStateChange, stopPolling]);

  // Start polling when video is active
  useEffect(() => {
    if (isVideoActive && videoTaskId) {
      // Ensure only one polling interval per card
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);

      // Start elapsed timer
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        if (isMountedRef.current) setElapsedSeconds(s => s + 1);
      }, 1000);

      // Poll immediately, then at interval
      pollTask(videoTaskId);
      pollingRef.current = setInterval(() => pollTask(videoTaskId), POLL_INTERVAL_MS);

      return () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      };
    }
    return undefined;
  }, [isVideoActive, videoTaskId, pollTask]);

  const handleCopyPrompt = () => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    toast.success("Prompt copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const uploadBase64ToStorage = async (base64Url: string, varId: string): Promise<string> => {
    if (!base64Url.startsWith("data:")) return base64Url;

    const res = await fetch(base64Url);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : "jpg";
    const fileName = `variant_${varId}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("videos")
      .upload(fileName, blob, { contentType: blob.type, upsert: true });

    if (error) throw new Error(`Error subiendo imagen: ${error.message}`);

    const { data: publicData } = supabase.storage.from("videos").getPublicUrl(fileName);
    return publicData.publicUrl;
  };

  const handleGenerateVideo = async () => {
    // Prevent duplicate submissions
    if (isSubmitting || isVideoActive) {
      toast.info("Ya hay una generación de video en curso.");
      return;
    }
    if (!variant.generated_image_url) {
      toast.error("La imagen de la variante es necesaria para generar video.");
      return;
    }
    if (!promptText) {
      toast.error("El prompt de animación es necesario.");
      return;
    }

    setIsSubmitting(true);
    setVideoStatus("queued");
    setVideoError(undefined);
    setVideoUrl(undefined);
    setVideoTaskId(undefined);

    try {
      // Upload base64 image to storage to get a public URL
      const publicImageUrl = await uploadBase64ToStorage(variant.generated_image_url, variant.variant_id);

      const { data, error } = await supabase.functions.invoke("generate-video-sora", {
        body: {
          variantId: variant.variant_id,
          imageUrl: publicImageUrl,
          promptText,
          mode: "standard",
          language: language || "es-MX",
          accent: accent || "mexicano",
        },
      });

      if (error || data?.error) {
        const errMsg = data?.error || error?.message || "Error al iniciar generación de video.";
        setVideoStatus("failed");
        setVideoError(errMsg);
        toast.error(errMsg);
        onVideoStateChange?.({ video_status: "failed", video_error: errMsg });
        return;
      }

      // Validate we got a taskId back
      if (!data?.taskId) {
        const errMsg = "El proveedor no devolvió un taskId válido.";
        setVideoStatus("failed");
        setVideoError(errMsg);
        toast.error(errMsg);
        onVideoStateChange?.({ video_status: "failed", video_error: errMsg });
        return;
      }

      const taskId = data.taskId;
      setVideoTaskId(taskId);
      setVideoStatus("queued");
      onVideoStateChange?.({ video_task_id: taskId, video_status: "queued", video_mode: data.mode });
      toast.success("Generación de video iniciada");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Error desconocido";
      setVideoStatus("failed");
      setVideoError(errMsg);
      toast.error(errMsg);
      onVideoStateChange?.({ video_status: "failed", video_error: errMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryVideo = () => {
    stopPolling();
    setVideoStatus("idle");
    setVideoError(undefined);
    setVideoTaskId(undefined);
    setVideoUrl(undefined);
    setElapsedSeconds(0);
    // Don't auto-trigger - let user click again
  };

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/20">
      {/* Image */}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : variant.generated_image_url ? (
          <img
            src={variant.generated_image_url}
            alt={`Variante ${variant.variant_id}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">Imagen no disponible</p>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold text-foreground backdrop-blur-sm">
            {variant.variant_id}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {variant.generated_image_url && !isPending && (
          <button
            onClick={() => handleDownloadImage(variant.generated_image_url, variant.variant_id)}
            className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* Universal animation prompt */}
        {promptText && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Prompt universal para Sora / HeyGen / Kling
            </p>
            <p className="text-[10px] text-muted-foreground">
              Copia y pega este bloque completo en tu generador de video. Ya incluye estructura, energía, delivery, timeline comprimido a 15 segundos y guion variante.
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5">
              <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-foreground font-mono">
                {promptText}
              </pre>
            </div>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex gap-2">
          {promptText && (
            <Button variant="default" size="sm" className="flex-1 gap-1 text-[10px]" onClick={handleCopyPrompt}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar Prompt"}
            </Button>
          )}
          {variant.generated_image_url && !isPending && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-[10px]"
              onClick={() => handleDownloadImage(variant.generated_image_url, variant.variant_id)}
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Video generation */}
        {variant.generated_image_url && promptText && !isPending && (
          <div className="space-y-2">
            {/* Generate button - shown when idle or no video */}
            {videoStatus === "idle" && !videoUrl && (
              <Button
                variant="default"
                size="sm"
                className="w-full gap-1.5 text-[10px]"
                onClick={handleGenerateVideo}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Video className="h-3 w-3" />
                )}
                {isSubmitting ? "Subiendo imagen..." : "Generar Video (15s)"}
              </Button>
            )}

            {/* Active generation status */}
            {isVideoActive && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-[10px] text-muted-foreground">
                    {VIDEO_STATUS_CONFIG[videoStatus]?.label || "Procesando..."}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatElapsed(elapsedSeconds)}
                </span>
              </div>
            )}

            {/* Failed state */}
            {videoStatus === "failed" && (
              <div className="space-y-1.5">
                {videoError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-[10px] text-destructive">{videoError}</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full gap-1 text-[10px]" onClick={handleRetryVideo}>
                  <RefreshCw className="h-3 w-3" />
                  Reintentar video
                </Button>
              </div>
            )}

            {/* Completed - show video */}
            {videoStatus === "completed" && videoUrl && (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-md border border-border">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full"
                    preload="metadata"
                    playsInline
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-1 text-[10px]"
                    onClick={() => handleDownloadVideo(videoUrl, variant.variant_id)}
                  >
                    <Download className="h-3 w-3" />
                    Descargar video
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-[10px]" onClick={handleRetryVideo}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2">
          {variant.status !== "approved" && !isPending && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onApprove}>
              <ThumbsUp className="h-3 w-3" /> Aprobar
            </Button>
          )}
          {variant.status !== "rejected" && !isPending && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onReject}>
              <ThumbsDown className="h-3 w-3" /> Rechazar
            </Button>
          )}
          {!isPending && (
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" onClick={onRegenerate}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Collapsed technical details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border/30 py-1 text-[10px] text-muted-foreground hover:bg-muted"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? "Ocultar detalles" : "Detalles técnicos (opcional)"}
        </button>

        {showDetails && (
          <div className="space-y-2 text-[11px]">
            <Detail label="Actor" value={variant.actor_archetype} />
            <Detail label="Distancia" value={variant.identity_distance?.toUpperCase()} />
            {variant.script_variant && (
              <>
                <Detail label="Hook" value={variant.script_variant.hook} />
                <Detail label="Body" value={variant.script_variant.body} />
                <Detail label="CTA" value={variant.script_variant.cta} />
                <Detail label="Duración objetivo" value="15s" />
              </>
            )}
            {variant.heygen_ready_brief && (
              <Detail label="Energía" value={`${variant.heygen_ready_brief.energy} · ${variant.heygen_ready_brief.pace} · ${variant.heygen_ready_brief.delivery_style}`} />
            )}
            {variant.generation_attempt > 1 && (
              <Detail label="Intento" value={`#${variant.generation_attempt}`} />
            )}
            {videoTaskId && (
              <Detail label="Video Task" value={videoTaskId} />
            )}
            <Detail label="Resumen" value={variant.variant_summary} />
          </div>
        )}
      </div>
    </div>
  );
};

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default VariantCard;
