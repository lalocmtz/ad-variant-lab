import { ArrowLeft } from "lucide-react";
import VariantCard from "@/components/VariantCard";
import type { AnalysisResult } from "@/pages/Index";

interface ResultsViewProps {
  results: AnalysisResult;
  onReset: () => void;
}

const ResultsView = ({ results, onReset }: ResultsViewProps) => {
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
        <h2 className="text-2xl font-bold text-foreground">
          Variantes Generadas ({results.variants.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          {results.has_voice ? `Voz: ${results.content_type}` : "Modo silencioso — sin voiceover"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-1">
        {results.variants.map((variant) => (
          <VariantCard key={variant.variant_id} variant={variant} />
        ))}
      </div>
    </div>
  );
};

export default ResultsView;
