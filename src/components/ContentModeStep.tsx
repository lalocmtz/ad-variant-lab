import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Package, HelpCircle, ArrowRight, RotateCcw } from "lucide-react";

export interface ClassificationResult {
  content_mode: "avatar" | "product_broll" | "mixed";
  confidence: number;
  recommended_pipeline: "avatar_variants" | "product_broll_voice_variants";
  reasoning: string;
  person_visibility_ratio: number;
  product_visual_dominance: number;
}

interface ContentModeStepProps {
  classification: ClassificationResult;
  coverUrl: string;
  onSelectMode: (mode: "avatar" | "product_broll") => void;
  onCancel: () => void;
}

const MODE_CONFIG = {
  avatar: {
    icon: User,
    label: "Variantes con Avatar",
    desc: "Genera variantes con actores diferentes manteniendo la misma estructura de persuasión.",
    color: "bg-primary/10 text-primary border-primary/30",
  },
  product_broll: {
    icon: Package,
    label: "Voice-Over sobre B-Roll",
    desc: "Mismo video de producto + múltiples guiones de voz con diferentes ángulos de persuasión.",
    color: "bg-accent/50 text-accent-foreground border-accent",
  },
  mixed: {
    icon: HelpCircle,
    label: "Mixto",
    desc: "El video combina presencia de creador y B-roll de producto.",
    color: "bg-muted text-muted-foreground border-border",
  },
};

const ContentModeStep = ({ classification, coverUrl, onSelectMode, onCancel }: ContentModeStepProps) => {
  const detected = MODE_CONFIG[classification.content_mode];
  const DetectedIcon = detected.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-foreground">Modo de Contenido Detectado</h2>
        <p className="text-sm text-muted-foreground">
          El sistema analizó el video y detectó el tipo de contenido. Puedes confirmar o cambiar el pipeline.
        </p>
      </div>

      {/* Detection result */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-start gap-4">
          {coverUrl && (
            <img src={coverUrl} alt="Cover" className="h-32 w-auto rounded-lg border border-border object-cover" />
          )}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <DetectedIcon className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold text-foreground">{detected.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {Math.round(classification.confidence * 100)}% confianza
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{classification.reasoning}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Visibilidad persona: <strong>{Math.round(classification.person_visibility_ratio * 100)}%</strong></span>
              <span>Dominancia producto: <strong>{Math.round(classification.product_visual_dominance * 100)}%</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline selection */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Selecciona el pipeline:</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onSelectMode("avatar")}
            className={`rounded-xl border-2 p-4 text-left transition-all hover:border-primary/50 ${
              classification.recommended_pipeline === "avatar_variants" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Variantes con Avatar</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Nuevos actores + nuevos guiones + nuevas imágenes. El pipeline original de identity swap.
            </p>
            {classification.recommended_pipeline === "avatar_variants" && (
              <Badge className="mt-2 text-[10px]">Recomendado</Badge>
            )}
          </button>

          <button
            onClick={() => onSelectMode("product_broll")}
            className={`rounded-xl border-2 p-4 text-left transition-all hover:border-primary/50 ${
              classification.recommended_pipeline === "product_broll_voice_variants" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Voice-Over B-Roll</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Genera un video nuevo desde cero basado en patrones de referencia + múltiples voice-overs con diferentes ángulos.
            </p>
            {classification.recommended_pipeline === "product_broll_voice_variants" && (
              <Badge className="mt-2 text-[10px]">Recomendado</Badge>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-2" onClick={onCancel}>
          <RotateCcw className="h-4 w-4" />
          Volver
        </Button>
      </div>
    </div>
  );
};

export default ContentModeStep;
