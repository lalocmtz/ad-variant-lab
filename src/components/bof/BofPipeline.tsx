import { motion } from "framer-motion";
import { Loader2, FileText, Image, Film, Scissors, Mic, Merge, Sparkles, LinkIcon } from "lucide-react";

const PIPELINE_STEPS = [
  { label: "Generando scripts", icon: FileText },
  { label: "Generando escenas visuales", icon: Sparkles },
  { label: "Generando imágenes", icon: Image },
  { label: "Animando escenas", icon: Film },
  { label: "Uniendo clips", icon: LinkIcon },
  { label: "Generando voz", icon: Mic },
  { label: "Fusionando audio + video", icon: Merge },
];

interface BofPipelineProps {
  currentStep: number;
  totalVariants: number;
  statusMessage?: string;
}

export default function BofPipeline({ currentStep, totalVariants, statusMessage }: BofPipelineProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 space-y-8">
      <div className="flex items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Procesando {totalVariants} variantes BOF</h2>
      </div>

      {statusMessage && (
        <p className="text-sm text-muted-foreground text-center max-w-md">{statusMessage}</p>
      )}

      <div className="w-full max-w-md space-y-3">
        {PIPELINE_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === currentStep;
          const isDone = idx < currentStep;
          return (
            <div key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? "bg-accent border border-foreground/20" : isDone ? "bg-muted/50" : "opacity-40"}`}>
              <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${isDone ? "bg-foreground text-background" : isActive ? "bg-foreground/10" : "bg-muted"}`}>
                {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : isDone ? <span className="text-xs font-bold">✓</span> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-sm ${isActive ? "font-medium text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
