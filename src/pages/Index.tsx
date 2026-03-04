import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import InputStep from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";
import { supabase } from "@/integrations/supabase/client";

export type AppStep = "input" | "processing" | "results";

export interface VariantResult {
  variant_id: string;
  variant_summary: string;
  shotlist: Array<{ shot: number; duration: string; description: string }>;
  script: { hook: string; body: string; cta: string };
  on_screen_text_plan: Array<{ timestamp: string; text: string }>;
  base_image_prompt_9x16: string;
  generated_image_url: string;
  hisfield_master_motion_prompt: string;
  negative_prompt: string;
}

export interface AnalysisResult {
  input_mode: string;
  has_voice: boolean;
  content_type: string;
  source_blueprint: Record<string, unknown>;
  variants: VariantResult[];
}

const Index = () => {
  const [step, setStep] = useState<AppStep>("input");
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (formData: {
    url: string;
    productImage: File | null;
    referenceActor: File | null;
    variantCount: number;
  }) => {
    setStep("processing");
    setError(null);
    setPipelineStep(0);

    try {
      // Step 1: Download TikTok video
      setPipelineStep(0);
      const { data: downloadData, error: downloadError } = await supabase.functions.invoke("download-tiktok", {
        body: { url: formData.url },
      });
      if (downloadError || downloadData?.error) {
        throw new Error(downloadData?.error || downloadError?.message || "Error descargando video");
      }
      setPipelineStep(1);

      // Step 2: Analyze video with AI
      setPipelineStep(2);
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-video", {
        body: {
          video_url: downloadData.video_url,
          variant_count: formData.variantCount,
          metadata: downloadData.metadata,
        },
      });
      if (analysisError || analysisData?.error) {
        throw new Error(analysisData?.error || analysisError?.message || "Error analizando video");
      }
      setPipelineStep(5);

      // Step 3: Generate images for each variant
      setPipelineStep(6);
      const variants: VariantResult[] = [];
      for (const variant of analysisData.variants) {
        try {
          const { data: imageData, error: imageError } = await supabase.functions.invoke("generate-variant-image", {
            body: { prompt: variant.base_image_prompt_9x16 },
          });
          variants.push({
            ...variant,
            generated_image_url: imageError || imageData?.error ? "" : imageData.image_url,
          });
        } catch {
          variants.push({ ...variant, generated_image_url: "" });
        }
      }
      setPipelineStep(7);

      setResults({
        input_mode: analysisData.input_mode,
        has_voice: analysisData.has_voice,
        content_type: analysisData.content_type,
        source_blueprint: analysisData.source_blueprint,
        variants,
      });
      setStep("results");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      console.error("Pipeline error:", e);
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, []);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <span className="text-sm font-bold text-primary-foreground">PV</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Perfect Variant Engine
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {["Entrada", "Análisis", "Resultados"].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-border" />}
                <span className={`text-xs font-medium ${
                  (i === 0 && step === "input") ||
                  (i === 1 && step === "processing") ||
                  (i === 2 && step === "results")
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <InputStep onSubmit={handleSubmit} />
            </motion.div>
          )}
          {step === "processing" && (
            <motion.div key="processing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <ProcessingPipeline currentStep={pipelineStep} />
            </motion.div>
          )}
          {step === "results" && results && (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <ResultsView results={results} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
