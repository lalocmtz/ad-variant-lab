import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Layers, Mic, FileText, Brain, Shuffle, ImageIcon, CheckCircle2 } from "lucide-react";

const steps = [
  { label: "Downloading video", icon: Download },
  { label: "Extracting frames", icon: Layers },
  { label: "Detecting voice", icon: Mic },
  { label: "Transcribing audio", icon: FileText },
  { label: "Understanding video structure", icon: Brain },
  { label: "Generating controlled variants", icon: Shuffle },
  { label: "Generating variant images", icon: ImageIcon },
  { label: "Ready", icon: CheckCircle2 },
];

const ProcessingPipeline = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-10">
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-bold text-foreground">Analyzing Ad</h2>
        <p className="text-sm text-muted-foreground">
          Extracting structure from the original video...
        </p>
      </div>

      <div className="space-y-1">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const isPending = i > currentStep;

          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                isActive
                  ? "bg-primary/10 border border-primary/20"
                  : isDone
                  ? "bg-transparent"
                  : "bg-transparent opacity-40"
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-md ${
                isDone
                  ? "bg-primary/20 text-primary"
                  : isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-sm font-medium ${
                isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
              }`}>
                {step.label}
              </span>
              {isActive && (
                <motion.div
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {isDone && (
                <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ProcessingPipeline;
