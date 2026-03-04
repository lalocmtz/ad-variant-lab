import { ArrowLeft } from "lucide-react";
import VariantCard from "@/components/VariantCard";
import KlingAnimationPanel from "@/components/KlingAnimationPanel";
import type { AnalysisResult } from "@/pages/Index";

interface ResultsViewProps {
  results: AnalysisResult;
  videoUrl: string;
  onReset: () => void;
}

const ResultsView = ({ results, videoUrl, onReset }: ResultsViewProps) => {
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
          Variantes Generadas ({results.variants.length})
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {results.variants.map((variant) => (
          <VariantCard key={variant.variant_id} variant={variant} />
        ))}
      </div>

      {videoUrl && (
        <KlingAnimationPanel variants={results.variants} videoUrl={videoUrl} />
      )}
    </div>
  );
};

export default ResultsView;
