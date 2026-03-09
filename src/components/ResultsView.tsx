import { ArrowLeft, Clock, Zap, MessageSquare, Camera } from "lucide-react";
import VariantCard from "@/components/VariantCard";
import KlingAnimationPanel from "@/components/KlingAnimationPanel";
import type { AnalysisResult, VariantStatus } from "@/pages/Index";

interface ResultsViewProps {
  results: AnalysisResult;
  videoUrl: string;
  videoDuration?: number;
  videoMode?: "avatar" | "no_avatar";
  onReset: () => void;
  onRegenerateVariant: (variantIndex: number) => void;
  onUpdateVariantStatus: (variantIndex: number, status: VariantStatus) => void;
}

const ResultsView = ({
  results,
  videoUrl,
  videoDuration,
  videoMode,
  onReset,
  onRegenerateVariant,
  onUpdateVariantStatus,
}: ResultsViewProps) => {
  const bp = results.winner_blueprint;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <button
          onClick={onReset}
          className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Nuevo Análisis
        </button>
        <h2 className="text-2xl font-bold text-foreground">
          Fórmula Ganadora Extraída
        </h2>
      </div>

      {/* Winner Blueprint Summary */}
      {bp && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Winner Blueprint
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BlueprintStat icon={<Clock className="h-4 w-4" />} label="Duración" value={`${bp.duration_seconds}s`} />
            <BlueprintStat icon={<Zap className="h-4 w-4" />} label="Hook" value={bp.primary_hook_type} />
            <BlueprintStat icon={<MessageSquare className="h-4 w-4" />} label="Emoción" value={bp.core_emotion} />
            <BlueprintStat icon={<Camera className="h-4 w-4" />} label="Escena" value={bp.scene_type} />
          </div>
          {bp.conversion_mechanics && bp.conversion_mechanics.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Mecánicas de conversión</p>
              <div className="flex flex-wrap gap-1.5">
                {bp.conversion_mechanics.map((m, i) => (
                  <span key={i} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          {bp.beat_timeline && bp.beat_timeline.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Beat Timeline</p>
              <div className="flex flex-wrap gap-2">
                {bp.beat_timeline.map((beat, i) => (
                  <div key={i} className="rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px]">
                    <span className="font-semibold text-foreground">{beat.beat_type}</span>
                    <span className="text-muted-foreground"> {beat.start_sec}–{beat.end_sec}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variants */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">
          Variantes Generadas ({results.variants.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Cada variante preserva la fórmula ganadora con un actor completamente distinto y guión adaptado.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {results.variants.map((variant, index) => (
          <VariantCard
            key={variant.variant_id}
            variant={variant}
            onRegenerate={() => onRegenerateVariant(index)}
            onApprove={() => onUpdateVariantStatus(index, "approved")}
            onReject={() => onUpdateVariantStatus(index, "rejected")}
          />
        ))}
      </div>

      {videoUrl && (
        <KlingAnimationPanel
          variants={results.variants}
          videoUrl={videoUrl}
          videoDuration={videoDuration}
          videoMode={videoMode}
        />
      )}
    </div>
  );
};

function BlueprintStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium text-foreground capitalize">{value}</p>
      </div>
    </div>
  );
}

export default ResultsView;
