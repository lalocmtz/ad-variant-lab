import { Volume2, Video, Loader2 } from "lucide-react";
import type { VariantResult } from "@/pages/Index";

interface VariantCardProps {
  variant: VariantResult;
}

type AnimationStatus = "idle" | "generating_audio" | "animating" | "completed" | "failed";

const VariantCard = ({ variant }: VariantCardProps) => {

  const animationStatus: AnimationStatus = variant.video_url
    ? "completed"
    : variant.animation_task_id
    ? "animating"
    : variant.audio_url
    ? "idle"
    : "idle";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30">
      {/* Horizontal layout for desktop */}
      <div className="flex flex-col md:flex-row">
        {/* Thumbnail */}
        <div className="relative w-full md:w-48 shrink-0 overflow-hidden bg-muted">
          <div className="aspect-[9/16] md:aspect-auto md:h-full">
            {variant.generated_image_url ? (
              <img
                src={variant.generated_image_url}
                alt={`Variante ${variant.variant_id}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-lg font-bold text-primary">{variant.variant_id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Sin imagen</p>
                </div>
              </div>
            )}
          </div>
          <div className="absolute left-2 top-2">
            <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-semibold text-foreground backdrop-blur-sm">
              {variant.variant_id}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-4 gap-3">
          {/* Script section */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guion</p>
            <div className="space-y-1.5">
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <span className="text-xs font-medium text-primary">Hook:</span>
                <p className="text-xs text-secondary-foreground">{variant.script.hook}</p>
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <span className="text-xs font-medium text-accent">Body:</span>
                <p className="text-xs text-secondary-foreground">{variant.script.body}</p>
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <span className="text-xs font-medium text-destructive">CTA:</span>
                <p className="text-xs text-secondary-foreground">{variant.script.cta}</p>
              </div>
            </div>
          </div>

          {/* Audio/Video status */}
          <div className="flex items-center gap-2 text-xs">
            {variant.audio_url && (
              <div className="flex items-center gap-1 text-primary">
                <Volume2 className="h-3 w-3" />
                <span>Audio listo</span>
              </div>
            )}
            {animationStatus === "animating" && (
              <div className="flex items-center gap-1 text-accent">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Animando...</span>
              </div>
            )}
            {animationStatus === "completed" && (
              <div className="flex items-center gap-1 text-primary">
                <Video className="h-3 w-3" />
                <span>Video listo</span>
              </div>
            )}
            {/* failed state reserved for future use */}
          </div>

          {/* Video player */}
          {variant.video_url && (
            <div className="rounded-lg overflow-hidden border border-border bg-muted">
              <video
                src={variant.video_url}
                controls
                className="w-full max-h-64"
                poster={variant.generated_image_url || undefined}
              />
            </div>
          )}

          {/* Audio player */}
          {variant.audio_url && !variant.video_url && (
            <audio src={variant.audio_url} controls className="w-full h-8" />
          )}

        </div>
      </div>
    </div>
  );
};

export default VariantCard;
