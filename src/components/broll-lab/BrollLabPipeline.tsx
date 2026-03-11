import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { PipelineStep } from "@/lib/broll_lab_types";

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "downloading", label: "Descargando referencias TikTok" },
  { key: "analyzing", label: "Analizando hooks, escenas y patrones" },
  { key: "generating_images", label: "Generando 3 escenas ultra-realistas" },
  { key: "animating", label: "Animando escenas con Sora 2" },
  { key: "stitching", label: "Preparando video master" },
  { key: "generating_voices", label: "Generando 5 variantes de voz" },
  { key: "merging", label: "Fusionando resultados finales" },
];

function stepIndex(step: PipelineStep): number {
  const idx = STEPS.findIndex((s) => s.key === step);
  return idx === -1 ? -1 : idx;
}

interface Props {
  currentStep: PipelineStep;
  stepMessage: string;
}

export default function BrollLabPipeline({ currentStep, stepMessage }: Props) {
  if (currentStep === "idle") return null;

  const currentIdx = stepIndex(currentStep);
  const isError = currentStep === "error";
  const isDone = currentStep === "done";

  return (
    <div className="space-y-3 py-4">
      {STEPS.map((s, i) => {
        let status: "done" | "active" | "pending" | "error" = "pending";
        if (isDone || i < currentIdx) status = "done";
        else if (i === currentIdx && !isError) status = "active";
        else if (i === currentIdx && isError) status = "error";

        return (
          <div key={s.key} className="flex items-center gap-3">
            {status === "done" && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
            {status === "active" && <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />}
            {status === "pending" && <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />}
            {status === "error" && <XCircle className="h-5 w-5 text-destructive shrink-0" />}
            <span
              className={
                status === "done"
                  ? "text-sm text-muted-foreground"
                  : status === "active"
                  ? "text-sm font-medium text-foreground"
                  : status === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground/50"
              }
            >
              {s.label}
            </span>
          </div>
        );
      })}

      {stepMessage && (
        <p className="text-xs text-muted-foreground mt-2 pl-8">{stepMessage}</p>
      )}
    </div>
  );
}
