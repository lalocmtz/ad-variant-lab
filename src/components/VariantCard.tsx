import { useState } from "react";
import { Copy, Download, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VariantResult } from "@/pages/Index";

interface VariantCardProps {
  variant: VariantResult;
}

const VariantCard = ({ variant }: VariantCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field, label }: { text: string; field: string; label: string }) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      className="h-8 gap-1.5 text-xs"
    >
      {copiedField === field ? (
        <Check className="h-3 w-3 text-primary" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {label}
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30">
      {/* Image Preview Placeholder */}
      <div className="relative aspect-[9/16] max-h-64 w-full overflow-hidden bg-muted">
        {variant.generated_image_url ? (
          <img
            src={variant.generated_image_url}
            alt={`Variant ${variant.variant_id}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">{variant.variant_id}</span>
              </div>
              <p className="text-xs text-muted-foreground">Image will be generated</p>
            </div>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <span className="rounded-md bg-background/80 px-2 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
            Variant {variant.variant_id}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        <p className="text-sm text-secondary-foreground">{variant.variant_summary}</p>

        {/* Script Preview */}
        <div className="rounded-md bg-muted p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hook
          </p>
          <p className="text-sm font-medium text-foreground">"{variant.script.hook}"</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <CopyButton
            text={variant.hisfield_master_motion_prompt}
            field={`motion-${variant.variant_id}`}
            label="Copy Motion Prompt"
          />
          <CopyButton
            text={JSON.stringify(variant, null, 2)}
            field={`json-${variant.variant_id}`}
            label="Copy JSON"
          />
          {variant.generated_image_url && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href={variant.generated_image_url} download>
                <Download className="h-3 w-3" />
                Download Image
              </a>
            </Button>
          )}
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 rounded-md py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Hide Details" : "Show Details"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {expanded && (
          <div className="space-y-3 border-t border-border pt-3">
            {/* Shotlist */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Shotlist
              </p>
              <div className="space-y-1">
                {variant.shotlist.map((shot) => (
                  <div key={shot.shot} className="flex gap-2 text-xs">
                    <span className="font-mono text-primary">{shot.duration}</span>
                    <span className="text-secondary-foreground">{shot.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Script */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Full Script
              </p>
              <div className="space-y-1 text-xs text-secondary-foreground">
                <p><span className="text-primary">Hook:</span> {variant.script.hook}</p>
                <p><span className="text-primary">Body:</span> {variant.script.body}</p>
                <p><span className="text-primary">CTA:</span> {variant.script.cta}</p>
              </div>
            </div>

            {/* On Screen Text */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On-Screen Text Plan
              </p>
              <div className="space-y-1">
                {variant.on_screen_text_plan.map((t, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="font-mono text-primary">{t.timestamp}</span>
                    <span className="text-secondary-foreground">{t.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Motion Prompt */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kling Motion Prompt
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-secondary-foreground">
                {variant.hisfield_master_motion_prompt}
              </pre>
            </div>

            {/* Image Prompt */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Image Prompt
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-secondary-foreground">
                {variant.base_image_prompt_9x16}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VariantCard;
