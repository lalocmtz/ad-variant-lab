import { useState } from "react";
import { ArrowLeft, Copy, Check, Download, Play, Pause, RefreshCw, ChevronDown, ChevronUp, Volume2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface BrollVariant {
  variant_id: string;
  hook_angle: string;
  script_text: string;
  hook: string;
  body: string;
  cta: string;
  estimated_duration_seconds: number;
  delivery_notes: string;
  audio_url?: string;
  status: "pending" | "generating_audio" | "ready" | "failed";
  error?: string;
}

export interface BrollResults {
  product_detected: string;
  scene_analysis: {
    shot_types: string[];
    product_handling: boolean;
    environment: string;
    pacing: string;
  };
  variants: BrollVariant[];
  master_video_url: string;
  is_ai_generated_master?: boolean;
  scene_description?: string;
  synthesis_summary?: {
    common_shot_types?: string[];
    common_actions?: string[];
    viral_structure?: string;
  };
}

interface BrollResultsViewProps {
  results: BrollResults;
  onReset: () => void;
  onRegenerateVariant: (index: number) => void;
}

function BrollVariantCard({ variant, masterVideoUrl, onRegenerate }: {
  variant: BrollVariant;
  masterVideoUrl: string;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(variant.script_text);
    setCopied(true);
    toast.success("Guión copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayDual = () => {
    const videoEl = document.getElementById(`broll-video-${variant.variant_id}`) as HTMLVideoElement;
    const audioEl = document.getElementById(`broll-audio-${variant.variant_id}`) as HTMLAudioElement;

    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
      audioEl?.pause();
      setIsPlaying(false);
    } else {
      videoEl.currentTime = 0;
      if (audioEl) audioEl.currentTime = 0;
      videoEl.muted = !!variant.audio_url;
      videoEl.play();
      audioEl?.play();
      setIsPlaying(true);

      videoEl.onended = () => {
        audioEl?.pause();
        setIsPlaying(false);
      };
    }
  };

  const isPending = variant.status === "pending" || variant.status === "generating_audio";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
        <video
          id={`broll-video-${variant.variant_id}`}
          src={masterVideoUrl}
          className="h-full w-full object-cover"
          preload="metadata"
          playsInline
          muted={!!variant.audio_url}
        />
        {variant.audio_url && (
          <audio id={`broll-audio-${variant.variant_id}`} src={variant.audio_url} preload="metadata" />
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold text-foreground backdrop-blur-sm">
            {variant.variant_id}
          </span>
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[10px]">
            {variant.hook_angle}
          </Badge>
        </div>

        {variant.status === "ready" && (
          <button
            onClick={handlePlayDual}
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30"
          >
            {isPlaying ? (
              <Pause className="h-12 w-12 text-white drop-shadow-lg" />
            ) : (
              <Play className="h-12 w-12 text-white drop-shadow-lg" />
            )}
          </button>
        )}

        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-lg bg-background/90 px-4 py-2">
              <Volume2 className="h-4 w-4 animate-pulse text-primary" />
              <span className="text-xs text-foreground">
                {variant.status === "generating_audio" ? "Generando audio..." : "Pendiente..."}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">~{variant.estimated_duration_seconds}s</span>
          <span className="text-[10px] text-muted-foreground">{variant.delivery_notes}</span>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-2">
          <p className="text-xs font-medium text-foreground">"{variant.hook}"</p>
        </div>

        <div className="flex gap-2">
          <Button variant="default" size="sm" className="flex-1 gap-1 text-[10px]" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copiado" : "Copiar guión"}
          </Button>
          {variant.audio_url && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-[10px]"
              onClick={() => {
                const a = document.createElement("a");
                a.href = variant.audio_url!;
                a.download = `voice_${variant.variant_id}.mp3`;
                a.target = "_blank";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1 text-[10px]" onClick={onRegenerate}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <button
          onClick={() => setShowScript(!showScript)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border/30 py-1 text-[10px] text-muted-foreground hover:bg-muted"
        >
          {showScript ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showScript ? "Ocultar guión completo" : "Ver guión completo"}
        </button>

        {showScript && (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-[11px]">
            <div>
              <span className="text-muted-foreground">Hook: </span>
              <span className="text-foreground">{variant.hook}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Body: </span>
              <span className="text-foreground">{variant.body}</span>
            </div>
            <div>
              <span className="text-muted-foreground">CTA: </span>
              <span className="text-foreground">{variant.cta}</span>
            </div>
          </div>
        )}

        {variant.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-[10px] text-destructive">{variant.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const BrollResultsView = ({ results, onReset, onRegenerateVariant }: BrollResultsViewProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <button
          onClick={onReset}
          className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Nuevo Análisis
        </button>
        <h2 className="text-xl font-bold text-foreground">
          Voice-Over Variants ({results.variants.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          {results.is_ai_generated_master ? (
            <>
              <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
              Video master generado por IA · {results.variants.length} guiones diferentes · {results.product_detected}
            </>
          ) : (
            <>Mismo video de producto · {results.variants.length} guiones diferentes · {results.product_detected}</>
          )}
        </p>
        {results.scene_description && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">{results.scene_description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {results.scene_analysis.shot_types.map(st => (
            <Badge key={st} variant="outline" className="text-[10px]">{st}</Badge>
          ))}
          <Badge variant="outline" className="text-[10px]">{results.scene_analysis.pacing}</Badge>
          {results.is_ai_generated_master && (
            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">IA Original</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {results.variants.map((variant, index) => (
          <BrollVariantCard
            key={variant.variant_id}
            variant={variant}
            masterVideoUrl={results.master_video_url}
            onRegenerate={() => onRegenerateVariant(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default BrollResultsView;
