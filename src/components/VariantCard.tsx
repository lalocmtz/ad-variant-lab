import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VariantResult } from "@/pages/Index";

interface VariantCardProps {
  variant: VariantResult;
}

const VariantCard = ({ variant }: VariantCardProps) => {
  const [copied, setCopied] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(variant.hisfield_master_motion_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30">
      {/* Image */}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
        {variant.generated_image_url ? (
          <img
            src={variant.generated_image_url}
            alt={`Variante ${variant.variant_id}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">{variant.variant_id}</span>
              </div>
              <p className="text-xs text-muted-foreground">Imagen no disponible</p>
            </div>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <span className="rounded-md bg-background/80 px-2 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
            Variante {variant.variant_id}
          </span>
        </div>
      </div>

      {/* Kling Motion Prompt */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Prompt para Kling Motion Control
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs text-secondary-foreground max-h-48 overflow-y-auto">
          {variant.hisfield_master_motion_prompt}
        </pre>
        <Button
          onClick={copyPrompt}
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
        >
          {copied ? (
            <><Check className="h-3 w-3 text-primary" /> Copiado</>
          ) : (
            <><Copy className="h-3 w-3" /> Copiar Prompt para Kling</>
          )}
        </Button>
      </div>
    </div>
  );
};

export default VariantCard;
