import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InputStep from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";

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

  const handleSubmit = useCallback(async (formData: {
    url: string;
    productImage: File | null;
    referenceActor: File | null;
    variantCount: number;
  }) => {
    setStep("processing");
    
    // Simulate processing for now - will be replaced with real backend
    setTimeout(() => {
      const mockVariants: VariantResult[] = Array.from({ length: formData.variantCount }, (_, i) => ({
        variant_id: String.fromCharCode(65 + i),
        variant_summary: `Variant ${String.fromCharCode(65 + i)} — Same structure, different actor and environment. Hook optimized for higher stop-scroll rate.`,
        shotlist: [
          { shot: 1, duration: "0-3s", description: "Close-up hook — actor holds product, surprised expression" },
          { shot: 2, duration: "3-8s", description: "Hands demo — product unboxing and texture reveal" },
          { shot: 3, duration: "8-12s", description: "Social proof — text overlay with testimonial" },
          { shot: 4, duration: "12-15s", description: "CTA — actor points at link, urgency text" },
        ],
        script: {
          hook: "I didn't expect this to actually work...",
          body: "Look at the quality. The texture. Everything about this is premium. I've tried dozens and nothing comes close.",
          cta: "Get yours before they sell out — link in bio",
        },
        on_screen_text_plan: [
          { timestamp: "0-3s", text: "WAIT FOR IT..." },
          { timestamp: "8-10s", text: "★★★★★ 12K+ Reviews" },
          { timestamp: "12-15s", text: "🔥 LIMITED STOCK" },
        ],
        base_image_prompt_9x16: "Hyper-realistic 9:16 photo of a young woman in natural daylight, holding a skincare product close to face, soft bokeh background, iPhone quality, TikTok aesthetic, warm tones",
        generated_image_url: "",
        hisfield_master_motion_prompt: `Use the original TikTok video as MOTION REFERENCE. Use the generated image as VISUAL REFERENCE. Replicate exact timing: Hook (0-3s), Demo (3-8s), Proof (8-12s), CTA (12-15s). Match camera distance and angles from original. Replace actor with person from generated image. Remove all original logos and text overlays. Add new text: "WAIT FOR IT..." at 0-3s, "★★★★★ 12K+ Reviews" at 8-10s, "🔥 LIMITED STOCK" at 12-15s.`,
        negative_prompt: "blurry, low quality, cartoon, illustration, anime, watermark, text artifacts, deformed hands, extra fingers",
      }));

      setResults({
        input_mode: "tiktok_url",
        has_voice: true,
        content_type: "HUMAN_TALKING",
        source_blueprint: {
          duration_seconds: 15,
          beat_timeline: ["hook", "demo", "proof", "cta"],
          motion_signature: "handheld, close-up dominant",
          product_interaction: "direct hold, texture showcase",
          core_message: "Product quality testimonial with urgency CTA",
        },
        variants: mockVariants,
      });
      setStep("results");
    }, 8000);
  }, []);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
            {["Input", "Analysis", "Results"].map((label, i) => (
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

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-6 py-12">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <InputStep onSubmit={handleSubmit} />
            </motion.div>
          )}
          {step === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ProcessingPipeline />
            </motion.div>
          )}
          {step === "results" && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <ResultsView results={results} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
