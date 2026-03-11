import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, RefreshCw } from "lucide-react";
import type { SceneResult, BrollLabAnalysis } from "@/lib/broll_lab_types";

interface Props {
  scenes: SceneResult[];
  approvedScenes: boolean[];
  analysis: BrollLabAnalysis | null;
  onApprove: (index: number) => void;
  onRegenerate: (index: number) => void;
  onContinue: () => void;
  regeneratingIndex: number | null;
}

export default function ImageApprovalPanel({
  scenes,
  approvedScenes,
  analysis,
  onApprove,
  onRegenerate,
  onContinue,
  regeneratingIndex,
}: Props) {
  const allApproved = approvedScenes.length > 0 && approvedScenes.every(Boolean);
  const successScenes = scenes.filter((s) => s.image_url);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Aprueba las imágenes antes de animar
        </h3>
        <Badge variant="outline" className="text-xs">
          {approvedScenes.filter(Boolean).length}/{successScenes.length} aprobadas
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scenes.map((scene) => {
          const idx = scene.scene_index;
          const approved = approvedScenes[idx] || false;
          const isRegenerating = regeneratingIndex === idx;
          const label = analysis?.scenes[idx]?.label || `Escena ${idx + 1}`;

          return (
            <div key={idx} className="space-y-2">
              <div className={`relative rounded-md overflow-hidden border-2 transition-colors ${
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
                {approved && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle2 className="h-5 w-5 text-green-500 drop-shadow" />
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground text-center truncate">{label}</p>

              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={approved ? "secondary" : "default"}
                  className="flex-1 h-7 text-xs"
                  onClick={() => onApprove(idx)}
                  disabled={!scene.image_url || isRegenerating}
                >
                  {approved ? "✓ Aprobada" : "Aprobar"}
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
        disabled={!allApproved}
        className="w-full gradient-cta text-white border-0 h-10"
      >
        {allApproved
          ? "Continuar — Animar y generar variantes"
          : `Aprueba las ${successScenes.length} imágenes para continuar`}
      </Button>
    </div>
  );
}
