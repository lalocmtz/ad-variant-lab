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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGES[variant.status] || STATUS_BADGES.ready;
  const script = variant.script_variant;
  const brief = variant.heygen_ready_brief;
  const isPending = variant.status === "pending";

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
        {/* Download button on image */}
        {variant.generated_image_url && !isPending && (
          <button
            onClick={() => handleDownloadImage(variant.generated_image_url, variant.variant_id)}
            className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* Identity distance + archetype */}
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
            Distancia: {variant.identity_distance}
          </span>
          {variant.generation_attempt > 1 && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Intento #{variant.generation_attempt}
            </span>
          )}
        </div>

        {/* 1. Who this variant is */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actor</p>
          <p className="text-xs font-medium text-foreground">{variant.actor_archetype}</p>
        </div>

        {/* 2. How it should speak */}
        {brief && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance</p>
            <p className="text-[11px] text-foreground">{brief.delivery_style} · {brief.energy} · {brief.pace}</p>
          </div>
        )}

        {/* 3. What it should say — Script */}
        {script && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Guión</p>
            <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
              <div>
                <span className="text-[9px] font-bold uppercase text-primary">Hook</span>
                <p className="text-xs text-foreground">{script.hook}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase text-primary">Body</span>
                <p className="text-xs text-foreground">{script.body}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase text-primary">CTA</span>
                <p className="text-xs text-foreground">{script.cta}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>{script.language}</span>
              <span>·</span>
              <span>{script.duration_target_seconds}s target</span>
            </div>
          </div>
        )}

        {/* 4. Summary */}
        <p className="text-[11px] text-muted-foreground italic">{variant.variant_summary}</p>

        {/* Copy buttons */}
        <div className="flex flex-wrap gap-1.5">
          {script?.full_script && <CopyButton text={script.full_script} label="Guión" />}
          {brief && (
            <CopyButton
              text={JSON.stringify(brief, null, 2)}
              label="Brief HeyGen"
            />
          )}
          {variant.base_image_prompt_9x16 && (
            <CopyButton text={variant.base_image_prompt_9x16} label="Image Prompt" />
          )}
        </div>

        {/* Expandable details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-border/30 py-1 text-[10px] text-muted-foreground hover:bg-muted"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Menos detalles" : "Más detalles"}
        </button>

        {expanded && (
          <div className="space-y-3 text-[11px]">
            {/* Image generation strategy */}
            {variant.image_generation_strategy && variant.image_generation_strategy.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pipeline de generación</p>
                <div className="flex gap-1.5">
                  {variant.image_generation_strategy.map((s, i) => (
                    <span key={i} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary capitalize">{s.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>
            )}

            {/* On-screen text plan */}
            {variant.on_screen_text_plan?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Texto en pantalla</p>
                {variant.on_screen_text_plan.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground font-mono">{t.timestamp}</span>
                    <span className="text-foreground">{t.text}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Shotlist */}
            {variant.shotlist?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Shotlist</p>
                {variant.shotlist.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground font-mono">Shot {s.shot} ({s.duration})</span>
                    <span className="text-foreground">{s.description}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Actor visual direction */}
            {variant.actor_visual_direction && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Dirección visual del actor</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(variant.actor_visual_direction).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
                      <span className="text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Identity replacement rules */}
            {variant.identity_replacement_rules && variant.identity_replacement_rules.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reglas de reemplazo de identidad</p>
                <ul className="list-disc list-inside space-y-0.5 text-foreground">
                  {variant.identity_replacement_rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Similarity check */}
            {variant.similarity_check_result && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Validación</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(variant.similarity_check_result).filter(([k]) => k !== "notes").map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span>
                      <span className={v === "pass" ? "text-green-600 font-medium" : "text-destructive font-medium"}>{v as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {variant.status !== "approved" && variant.status !== "pending" && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onApprove}>
              <ThumbsUp className="h-3 w-3" /> Aprobar
            </Button>
          )}
          {variant.status !== "rejected" && variant.status !== "pending" && (
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-[10px]" onClick={onReject}>
              <ThumbsDown className="h-3 w-3" /> Rechazar
            </Button>
          )}
          {variant.status !== "pending" && (
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" onClick={onRegenerate}>
              <RefreshCw className="h-3 w-3" /> Regenerar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VariantCard;
