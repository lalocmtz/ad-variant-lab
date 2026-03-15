import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, RefreshCw, Lock, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import type { SceneResult, BrollLabAnalysis, ProductValidationResult } from "@/lib/broll_lab_types";

interface Props {
  scenes: SceneResult[];
  approvedScenes: boolean[];
  analysis: BrollLabAnalysis | null;
  onApprove: (index: number) => void;
  onRegenerate: (index: number) => void;
  onContinue: () => void;
  regeneratingIndex: number | null;
  productLock?: boolean;
  productImageUrl?: string;
}

function getMatchLabel(score: number): { text: string; color: string } {
  if (score >= 0.9) return { text: "Exacto", color: "text-green-500" };
  if (score >= 0.75) return { text: "Aceptable", color: "text-yellow-500" };
  return { text: "Mismatch", color: "text-destructive" };
}

function ValidationBadge({ validation, productLock }: { validation?: ProductValidationResult; productLock: boolean }) {
  if (!validation) {
    if (productLock) return <Badge variant="outline" className="text-[9px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />Sin validar</Badge>;
    return null;
  }
  if (validation.skipped) return <Badge variant="outline" className="text-[9px]">Validación omitida</Badge>;

  const { text, color } = getMatchLabel(validation.overall_product_match);
  const score = Math.round(validation.overall_product_match * 100);
  const Icon = validation.pass ? ShieldCheck : ShieldAlert;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant={validation.pass ? "secondary" : "destructive"} className="text-[9px] gap-1">
            <Icon className="h-2.5 w-2.5" />
            {text} ({score}%)
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs space-y-1">
          <p className="font-medium">Consistencia del producto</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <span>Silueta:</span><span className={getMatchLabel(validation.silhouette_score).color}>{Math.round(validation.silhouette_score * 100)}%</span>
            <span>Color:</span><span className={getMatchLabel(validation.color_score).color}>{Math.round(validation.color_score * 100)}%</span>
            <span>Branding:</span><span className={getMatchLabel(validation.branding_score).color}>{Math.round(validation.branding_score * 100)}%</span>
            <span>Empaque:</span><span className={getMatchLabel(validation.packaging_score).color}>{Math.round(validation.packaging_score * 100)}%</span>
            <span>Proporción:</span><span className={getMatchLabel(validation.proportion_score).color}>{Math.round(validation.proportion_score * 100)}%</span>
          </div>
          {validation.failure_reasons.length > 0 && (
            <div className="pt-1 border-t border-border">
              {validation.failure_reasons.map((r, i) => (
                <p key={i} className="text-destructive">⚠ {r}</p>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ImageApprovalPanel({
  scenes,
  approvedScenes,
  analysis,
  onApprove,
  onRegenerate,
  onContinue,
  regeneratingIndex,
  productLock = true,
  productImageUrl,
}: Props) {
  const successScenes = scenes.filter((s) => s.image_url);
  const allApproved = successScenes.length > 0 && successScenes.every((s) => approvedScenes[s.scene_index]);

  // Block continue if product lock is on and any scene failed validation
  const hasBlockedScenes = productLock && successScenes.some(
    (s) => s.validation && !s.validation.pass && !s.validation.skipped
  );

  const canContinue = allApproved && !hasBlockedScenes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Aprueba las imágenes antes de animar
          </h3>
          {productLock && (
            <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
              <Lock className="h-2.5 w-2.5" /> Product Lock ON
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="text-xs">
          {approvedScenes.filter(Boolean).length}/{successScenes.length} aprobadas
        </Badge>
      </div>

      {/* Product reference mini-preview */}
      {productLock && productImageUrl && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/60">
          <img src={productImageUrl} alt="Referencia" className="h-10 w-10 rounded object-contain border border-border" />
          <span className="text-[10px] text-muted-foreground">Referencia del producto — todas las escenas deben coincidir</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scenes.map((scene) => {
          const idx = scene.scene_index;
          const approved = approvedScenes[idx] || false;
          const isRegenerating = regeneratingIndex === idx;
          const label = analysis?.scenes[idx]?.label || `Escena ${idx + 1}`;
          const validationFailed = productLock && scene.validation && !scene.validation.pass && !scene.validation?.skipped;
          const approveDisabled = !scene.image_url || isRegenerating || (productLock && validationFailed);

          return (
            <div key={idx} className="space-y-2">
              <div className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                validationFailed ? "border-destructive/60" :
                approved ? "border-green-500/60" : "border-border/60"
              }`}>
                {scene.image_url && !isRegenerating ? (
                  <img
                    src={scene.image_url}
                    alt={label}
                    className="aspect-[9/16] object-cover w-full"
                  />
                ) : (
                  <div className="aspect-[9/16] bg-muted animate-pulse flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                  </div>
                )}
                {approved && !validationFailed && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle2 className="h-5 w-5 text-green-500 drop-shadow" />
                  </div>
                )}
                {validationFailed && (
                  <div className="absolute top-1.5 right-1.5">
                    <ShieldAlert className="h-5 w-5 text-destructive drop-shadow" />
                  </div>
                )}
                {scene.regen_count && scene.regen_count > 0 && (
                  <div className="absolute top-1.5 left-1.5">
                    <Badge variant="secondary" className="text-[8px] px-1 py-0">
                      Regen ×{scene.regen_count}
                    </Badge>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground text-center truncate">{label}</p>

              <ValidationBadge validation={scene.validation} productLock={productLock} />

              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={approved && !validationFailed ? "secondary" : "default"}
                  className="flex-1 h-7 text-xs"
                  onClick={() => onApprove(idx)}
                  disabled={!!approveDisabled}
                >
                  {validationFailed ? "🔒 Bloqueada" : approved ? "✓ Aprobada" : "Aprobar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => onRegenerate(idx)}
                  disabled={isRegenerating}
                >
                  <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full gradient-cta text-white border-0 h-10"
      >
        {hasBlockedScenes
          ? "Regenera las escenas bloqueadas para continuar"
          : canContinue
          ? "Continuar — Animar y generar variantes"
          : `Aprueba las ${successScenes.length} imágenes para continuar`}
      </Button>
    </div>
  );
}
