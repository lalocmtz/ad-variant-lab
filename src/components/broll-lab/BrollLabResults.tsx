import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, RefreshCw, Play, Pause, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { BrollLabState, VoiceVariant, SceneResult } from "@/lib/broll_lab_types";

interface Props {
  state: BrollLabState;
  onRegenerateVoice?: (variantIndex: number) => void;
}

function VideoPlayer({ videoUrls, audioUrl }: { videoUrls: string[]; audioUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentClipIdx, setCurrentClipIdx] = useState(0);

  // For simplicity in V1, play the first video clip with audio overlay
  const currentUrl = videoUrls[currentClipIdx] || videoUrls[0];

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      audioRef.current?.pause();
    } else {
      videoRef.current.play();
      audioRef.current?.play();
    }
    setPlaying(!playing);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      if (currentClipIdx < videoUrls.length - 1) {
        setCurrentClipIdx((i) => i + 1);
      } else {
        setPlaying(false);
        setCurrentClipIdx(0);
      }
    };
    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [currentClipIdx, videoUrls.length]);

  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.play();
    }
  }, [currentClipIdx]);

  return (
    <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[280px]">
      <video
        ref={videoRef}
        src={currentUrl}
        className="w-full h-full object-contain"
        playsInline
        muted={!!audioUrl}
      />
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}
      <button
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
      >
        {!playing && <Play className="h-10 w-10 text-white/90" />}
      </button>
      {videoUrls.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {videoUrls.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentClipIdx ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceVariantCard({
  variant,
  videoUrls,
  onRegenerate,
}: {
  variant: VoiceVariant;
  videoUrls: string[];
  onRegenerate?: () => void;
}) {
  const audioUrl = variant.audio_url;

  const handleCopy = () => {
    navigator.clipboard.writeText(variant.script.full_text);
    toast.success("Guión copiado");
  };

  const handleDownload = async () => {
    if (!audioUrl) return;
    // Download audio for now (full video merge is dual_track)
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `broll_variant_${variant.variant_index + 1}.mp3`;
    link.click();
  };

  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">Variante {variant.variant_index + 1}</Badge>
          <Badge variant="outline" className="text-xs">{variant.script.tone}</Badge>
        </div>

        {videoUrls.length > 0 && (
          <VideoPlayer videoUrls={videoUrls} audioUrl={audioUrl} />
        )}

        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
          {variant.script.full_text}
        </p>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={!audioUrl} className="flex-1">
            <Download className="h-3.5 w-3.5 mr-1" /> Descargar
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy} className="flex-1">
            <Copy className="h-3.5 w-3.5 mr-1" /> Guión
          </Button>
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={variant.status === "generating_voice"}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrollLabResults({ state, onRegenerateVoice }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (state.step !== "done" && state.voiceVariants.length === 0) return null;

  const videoUrls = state.masterVideoUrls;

  return (
    <div className="space-y-6">
      {/* Summary */}
      {state.analysis && (
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Resumen del análisis</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">{state.analysis.summary_es}</p>
            {showDetails && (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p><strong>Producto:</strong> {state.analysis.product_detected}</p>
                <p><strong>Beneficios:</strong> {state.analysis.key_benefits.join(", ")}</p>
                <p><strong>Hooks:</strong> {state.analysis.common_hooks.join(" | ")}</p>
                <p><strong>Estructura:</strong> {state.analysis.ad_structure}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generated scenes */}
      {state.scenes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Escenas generadas</h3>
          <div className="grid grid-cols-4 gap-2">
            {state.scenes.map((scene) => (
              <div key={scene.scene_index} className="space-y-1">
                {scene.image_url ? (
                  <img src={scene.image_url} alt={`Escena ${scene.scene_index + 1}`} className="rounded-md aspect-[9/16] object-cover w-full" />
                ) : (
                  <div className="rounded-md aspect-[9/16] bg-muted animate-pulse" />
                )}
                <p className="text-[10px] text-muted-foreground text-center">
                  {scene.status === "done" ? "✓" : scene.status === "error" ? "✗" : "⏳"} Escena {scene.scene_index + 1}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voice variants */}
      {state.voiceVariants.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Variantes de voz ({state.voiceVariants.length})</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.voiceVariants.map((v) => (
              <VoiceVariantCard
                key={v.variant_index}
                variant={v}
                videoUrls={videoUrls}
                onRegenerate={onRegenerateVoice ? () => onRegenerateVoice(v.variant_index) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
