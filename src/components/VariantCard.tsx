import { useState } from "react";
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { VariantResult } from "@/pages/Index";

interface VariantCardProps {
  variant: VariantResult;
  onRegenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  ready: { label: "Listo", cls: "bg-primary/10 text-primary" },
  approved: { label: "Aprobado", cls: "bg-green-500/10 text-green-600" },
  rejected: { label: "Rechazado", cls: "bg-destructive/10 text-destructive" },
  needs_regeneration: { label: "Regenerar", cls: "bg-yellow-500/10 text-yellow-600" },
  pending: { label: "Generando...", cls: "bg-muted text-muted-foreground" },
};

function handleDownloadImage(url: string, variantId: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `variant_${variantId}.png`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const VariantCard = ({ variant, onRegenerate, onApprove, onReject }: VariantCardProps) => {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const badge = STATUS_BADGES[variant.status] || STATUS_BADGES.ready;
  const isPending = variant.status === "pending";
  const promptText = variant.prompt_package?.prompt_text || "";

  const handleCopyPrompt = () => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    toast.success("Prompt copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/20">
      {/* Image */}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : variant.generated_image_url ? (
          <img
            src={variant.generated_image_url}
            alt={`Variante ${variant.variant_id}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">Imagen no disponible</p>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold text-foreground backdrop-blur-sm">
            {variant.variant_id}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {variant.generated_image_url && !isPending && (
          <button
            onClick={() => handleDownloadImage(variant.generated_image_url, variant.variant_id)}
            className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Universal prompt block + actions */}
      <div className="space-y-3 p-4">
        {/* Universal animation prompt */}
        {promptText && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Prompt universal para Sora / HeyGen / Kling
            </p>
            <p className="text-[10px] text-muted-foreground">
              Copia y pega este bloque completo en tu generador de video. Ya incluye estructura, energía, delivery, timeline comprimido a 15 segundos y guion variante.
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5">
              <pre className="whitespace-pre-wrap text-[10px] leading-relaxed text-foreground font-mono">
                {promptText}
              </pre>
            </div>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex gap-2">
          {promptText && (
            <Button variant="default" size="sm" className="flex-1 gap-1 text-[10px]" onClick={handleCopyPrompt}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar Prompt"}
            </Button>
          )}
          {variant.generated_image_url && !isPending && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-[10px]"
              onClick={() => handleDownloadImage(variant.generated_image_url, variant.variant_id)}
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Secondary actions */}
        <div className="flex gap-2">
          {variant.status !== "approved" && !isPending && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onApprove}>
              <ThumbsUp className="h-3 w-3" /> Aprobar
            </Button>
          )}
          {variant.status !== "rejected" && !isPending && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onReject}>
              <ThumbsDown className="h-3 w-3" /> Rechazar
            </Button>
          )}
          {!isPending && (
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" onClick={onRegenerate}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Collapsed technical details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border/30 py-1 text-[10px] text-muted-foreground hover:bg-muted"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? "Ocultar detalles" : "Detalles técnicos (opcional)"}
        </button>

        {showDetails && (
          <div className="space-y-2 text-[11px]">
            <Detail label="Actor" value={variant.actor_archetype} />
            <Detail label="Distancia" value={variant.identity_distance?.toUpperCase()} />
            {variant.script_variant && (
              <>
                <Detail label="Hook" value={variant.script_variant.hook} />
                <Detail label="Body" value={variant.script_variant.body} />
                <Detail label="CTA" value={variant.script_variant.cta} />
                <Detail label="Duración objetivo" value="15s" />
              </>
            )}
            {variant.heygen_ready_brief && (
              <Detail label="Energía" value={`${variant.heygen_ready_brief.energy} · ${variant.heygen_ready_brief.pace} · ${variant.heygen_ready_brief.delivery_style}`} />
            )}
            {variant.generation_attempt > 1 && (
              <Detail label="Intento" value={`#${variant.generation_attempt}`} />
            )}
            <Detail label="Resumen" value={variant.variant_summary} />
          </div>
        )}
      </div>
    </div>
  );
};

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default VariantCard;
