import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import InputStep from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";
import HistoryPanel from "@/components/HistoryPanel";
import { supabase } from "@/integrations/supabase/client";

export type AppStep = "input" | "processing" | "results" | "history";

export interface SceneGeometry {
  camera_distance: string;
  product_hand: string;
  product_position: string;
  camera_angle: string;
  lighting_direction: string;
}

export interface VariantResult {
  variant_id: string;
  variant_summary: string;
  shotlist: Array<{ shot: number; duration: string; description: string }>;
  script: { hook: string; body: string; cta: string };
  on_screen_text_plan: Array<{ timestamp: string; text: string }>;
  base_image_prompt_9x16: string;
  generated_image_url: string;
  scene_geometry?: SceneGeometry;
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
  const [currentUrl, setCurrentUrl] = useState("");

  const saveToHistory = async (url: string, variantCount: number, analysisResults: AnalysisResult) => {
    try {
      await supabase.from("analysis_history").insert([{
        tiktok_url: url,
        variant_count: variantCount,
        results: JSON.parse(JSON.stringify(analysisResults)),
      }]);
    } catch (e) {
      console.error("Failed to save to history:", e);
    }
  };

  const handleSubmit = useCallback(async (formData: {
    url: string;
    productImage: File | null;
    referenceActor: File | null;
    variantCount: number;
  }) => {
    setStep("processing");
    setError(null);
    setPipelineStep(0);
    setCurrentUrl(formData.url);

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

      // Step 3: Generate images for each variant (passing scene_geometry + video reference)
      setPipelineStep(6);
      const variants: VariantResult[] = [];
      for (const variant of analysisData.variants) {
        try {
          const { data: imageData, error: imageError } = await supabase.functions.invoke("generate-variant-image", {
            body: {
              prompt: variant.base_image_prompt_9x16,
              scene_geometry: variant.scene_geometry,
              video_url: downloadData.video_url,
            },
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

      const analysisResults: AnalysisResult = {
        input_mode: analysisData.input_mode,
        has_voice: analysisData.has_voice,
        content_type: analysisData.content_type,
        source_blueprint: analysisData.source_blueprint,
        variants,
      };

      setResults(analysisResults);
      setStep("results");

      // Save to history
      await saveToHistory(formData.url, formData.variantCount, analysisResults);
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

  const handleLoadFromHistory = useCallback((historyResults: AnalysisResult) => {
    setResults(historyResults);
    setStep("results");
  }, []);

  const stepLabels = ["Entrada", "Análisis", "Resultados"];

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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="h-px w-6 bg-border" />}
                  <span className={`text-xs font-medium ${
                    (i === 0 && (step === "input" || step === "history")) ||
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
            <button
              onClick={() => setStep(step === "history" ? "input" : "history")}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Clock className="h-3.5 w-3.5" />
              Historial
            </button>
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
          {step === "history" && (
            <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <div className="mx-auto max-w-xl space-y-6">
                <h2 className="text-2xl font-bold text-foreground">Historial de Análisis</h2>
                <HistoryPanel onLoadResult={handleLoadFromHistory} />
              </div>
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
