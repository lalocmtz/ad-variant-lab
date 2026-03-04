import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VideoTrimmerDialogProps {
  open: boolean;
  onClose: () => void;
  videoUrl: string;
  videoDuration: number;
  onTrimmed: (trimmedUrl: string, duration: number) => void;
}

const MAX_CLIP = 30;
const THUMB_COUNT = 12;

const VideoTrimmerDialog = ({
  open,
  onClose,
  videoUrl,
  videoDuration,
  onTrimmed,
}: VideoTrimmerDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);

  const endTime = Math.min(startTime + MAX_CLIP, videoDuration);
  const clipDuration = endTime - startTime;
  const selectionLeft = (startTime / videoDuration) * 100;
  const selectionWidth = (clipDuration / videoDuration) * 100;

  // Extract thumbnails from video
  useEffect(() => {
    if (!open || !videoUrl || thumbnails.length > 0) return;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.preload = "auto";

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 170;
    const ctx = canvas.getContext("2d")!;

    const frames: string[] = [];
    const interval = videoDuration / THUMB_COUNT;
    let idx = 0;

    const onSeeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.4));
      idx++;
      if (idx < THUMB_COUNT) {
        video.currentTime = idx * interval;
      } else {
        setThumbnails([...frames]);
        video.removeEventListener("seeked", onSeeked);
        video.remove();
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = 0;
    });
    video.addEventListener("error", () => {
      // If CORS blocks thumbnails, generate empty placeholders
      setThumbnails(Array(THUMB_COUNT).fill(""));
      video.remove();
    });

    return () => {
      video.removeEventListener("seeked", onSeeked);
      video.remove();
    };
  }, [open, videoUrl, videoDuration]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStartTime(0);
      setIsPlaying(false);
      setIsTrimming(false);
      setTrimProgress(0);
    } else {
      setThumbnails([]);
    }
  }, [open]);

  // Constrain video playback to selection range
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.pause();
        video.currentTime = startTime;
        setIsPlaying(false);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [startTime, endTime]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Click on timeline to reposition selection window
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * videoDuration;
    const newStart = Math.max(0, Math.min(time - MAX_CLIP / 2, videoDuration - MAX_CLIP));
    setStartTime(Math.max(0, newStart));
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, newStart);
      setIsPlaying(false);
      videoRef.current.pause();
    }
  };

  // Drag the selection window
  const handleSelectionDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const timeline = e.currentTarget.parentElement!;
      const rect = timeline.getBoundingClientRect();
      const startX = e.clientX;
      const initialStart = startTime;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dt = (dx / rect.width) * videoDuration;
        const clamped = Math.max(0, Math.min(initialStart + dt, videoDuration - MAX_CLIP));
        setStartTime(clamped);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [startTime, videoDuration]
  );

  // Trim and upload
  const handleSave = async () => {
    setIsTrimming(true);
    setTrimProgress(0);

    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("Video load failed")), { once: true });
      });

      video.currentTime = startTime;
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });

      // Use captureStream + MediaRecorder
      const stream = (video as any).captureStream();
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      await new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Recording failed"));

        recorder.start(100); // Collect data every 100ms
        video.playbackRate = 4;
        video.play();

        // Track progress
        const progressInterval = setInterval(() => {
          const elapsed = video.currentTime - startTime;
          setTrimProgress(Math.min(100, (elapsed / clipDuration) * 100));
        }, 200);

        // Stop after clip duration (at 4x speed)
        const timeout = (clipDuration / 4) * 1000 + 1000;
        setTimeout(() => {
          clearInterval(progressInterval);
          video.pause();
          recorder.stop();
          stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        }, timeout);
      });

      const blob = new Blob(chunks, { type: "video/webm" });
      const fileName = `trimmed_${Date.now()}.webm`;

      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(fileName, blob, { contentType: "video/webm" });

      if (uploadErr) throw new Error(`Upload: ${uploadErr.message}`);

      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(fileName);

      video.remove();
      toast.success("Video recortado exitosamente");
      onTrimmed(pubUrl.publicUrl, clipDuration);
      onClose();
    } catch (err) {
      console.error("Trim error:", err);
      toast.error("Error al recortar el video. Intenta con un video más corto.");
    } finally {
      setIsTrimming(false);
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isTrimming && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-border/50 bg-card">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">Recortar video</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Selecciona hasta 30 segundos para usar en la generación
          </p>
        </DialogHeader>

        {/* Video Preview */}
        <div className="mx-6 rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-video object-contain"
            crossOrigin="anonymous"
            playsInline
          />
        </div>

        {/* Timeline */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={togglePlay}
              disabled={isTrimming}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Timeline strip */}
            <div
              className="relative flex-1 h-14 rounded-lg overflow-hidden bg-muted/50 cursor-pointer"
              onClick={handleTimelineClick}
            >
              {/* Thumbnails */}
              <div className="absolute inset-0 flex">
                {thumbnails.length > 0
                  ? thumbnails.map((thumb, i) =>
                      thumb ? (
                        <img
                          key={i}
                          src={thumb}
                          alt=""
                          className="h-full flex-1 object-cover opacity-40"
                          draggable={false}
                        />
                      ) : (
                        <div key={i} className="h-full flex-1 bg-muted/60" />
                      )
                    )
                  : Array.from({ length: THUMB_COUNT }).map((_, i) => (
                      <div key={i} className="h-full flex-1 bg-muted/60 animate-pulse" />
                    ))}
              </div>

              {/* Selection window */}
              <div
                className="absolute top-0 bottom-0 border-2 border-primary rounded cursor-grab active:cursor-grabbing z-10"
                style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}
                onMouseDown={handleSelectionDrag}
              >
                {/* Left handle */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary rounded-l" />
                {/* Right handle */}
                <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-primary rounded-r" />
                {/* Brightened thumbnails inside selection */}
                <div className="absolute inset-0 bg-primary/10" />
                {/* Time label */}
                <div className="absolute bottom-1 left-2 text-[10px] font-mono font-bold text-primary">
                  {fmt(startTime)}
                </div>
              </div>
            </div>

            {/* Total duration */}
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              {fmt(videoDuration)}
            </span>
          </div>

          {/* Trim progress */}
          {isTrimming && (
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${trimProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Recortando video... {Math.round(trimProgress)}%
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <Button variant="ghost" onClick={onClose} disabled={isTrimming}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isTrimming}>
            {isTrimming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scissors className="h-4 w-4" />
            )}
            {isTrimming ? "Recortando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoTrimmerDialog;
