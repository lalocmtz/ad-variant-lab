import { ArrowLeft, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VariantCard from "@/components/VariantCard";
import type { AnalysisResult } from "@/pages/Index";

interface ResultsViewProps {
  results: AnalysisResult;
  onReset: () => void;
}

const ResultsView = ({ results, onReset }: ResultsViewProps) => {
  const handleCopyFullJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(results, null, 2));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <button
            onClick={onReset}
            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            New Analysis
          </button>
          <h2 className="text-2xl font-bold text-foreground">Generated Variants</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-mono">
              {results.content_type}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {results.has_voice ? "Voice Detected" : "No Voice"}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {results.variants.length} variant{results.variants.length > 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyFullJSON}
          className="gap-2 text-xs"
        >
          <FileJson className="h-3.5 w-3.5" />
          Copy Full JSON
        </Button>
      </div>

      {/* Blueprint Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Source Blueprint
        </h3>
        <pre className="overflow-x-auto font-mono text-xs text-secondary-foreground">
          {JSON.stringify(results.source_blueprint, null, 2)}
        </pre>
      </div>

      {/* Variant Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {results.variants.map((variant) => (
          <VariantCard key={variant.variant_id} variant={variant} />
        ))}
      </div>
    </div>
  );
};

export default ResultsView;
