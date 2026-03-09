import { ArrowLeft } from "lucide-react";
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
          Variantes Generadas ({results.variants.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Copia el prompt universal y pégalo directamente en Sora, HeyGen, Kling, Runway o AIgen. Blueprint comprimido a 15 segundos.
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

export default ResultsView;
