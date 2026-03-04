import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import InputStep from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";
import HistoryPanel from "@/components/HistoryPanel";
import CoverPreviewStep from "@/components/CoverPreviewStep";
import { supabase } from "@/integrations/supabase/client";

export type AppStep = "input" | "downloading" | "preview" | "processing" | "results" | "history";

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
  audio_url?: string;
  animation_task_id?: string;
  video_url?: string;
  suggested_voice_gender?: string;
}

export interface AnalysisResult {
  input_mode: string;
  has_voice: boolean;
  content_type: string;
  suggested_voice_gender?: string;
  source_blueprint: Record<string, unknown>;
  variants: VariantResult[];
}

// Intermediate state after download, before analysis
interface DownloadedData {
  video_url: string;
  cover_url: string;
  metadata: Record<string, unknown>;
  product_image_url: string;
  variantCount: number;
  originalUrl: string;
}

const Index = () => {
  const [step, setStep] = useState<AppStep>("input");
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadedData, setDownloadedData] = useState<DownloadedData | null>(null);

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

  // Phase 1: Download video + upload product image → show preview
  const handleSubmit = useCallback(async (formData: {
    url: string;
    productImage: File | null;
    referenceActor: File | null;
    variantCount: number;
  }) => {
    setStep("downloading");
    setError(null);
    setPipelineStep(0);

    try {
      // Download TikTok video
      const { data: downloadData, error: downloadError } = await supabase.functions.invoke("download-tiktok", {
        body: { url: formData.url },
      });
      if (downloadError || downloadData?.error) {
        throw new Error(downloadData?.error || downloadError?.message || "Error descargando video");
      }

      // Upload product image to storage
      let productImageUrl = "";
      if (formData.productImage) {
        const ext = formData.productImage.name.split(".").pop() || "png";
        const productFileName = `product_${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("videos")
          .upload(productFileName, formData.productImage, { contentType: formData.productImage.type });
        if (uploadErr) {
          console.error("Product image upload error:", uploadErr);
          throw new Error("Error subiendo imagen del producto");
        }
        const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(productFileName);
        productImageUrl = pubUrl.publicUrl;
      }

      // Store data and show preview
      setDownloadedData({
        video_url: downloadData.video_url,
        cover_url: downloadData.cover_url || "",
        metadata: downloadData.metadata,
        product_image_url: productImageUrl,
        variantCount: formData.variantCount,
        originalUrl: formData.url,
      });
      setStep("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      console.error("Download error:", e);
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, []);

  // Phase 2: User confirmed → run analysis + image generation
  const handleConfirmPreview = useCallback(async () => {
    if (!downloadedData) return;
    setStep("processing");
    setPipelineStep(2);

    try {
      // Analyze video with AI
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-video", {
        body: {
          video_url: downloadedData.video_url,
          variant_count: downloadedData.variantCount,
          metadata: downloadedData.metadata,
          cover_url: downloadedData.cover_url,
          product_image_url: downloadedData.product_image_url,
        },
      });
      if (analysisError || analysisData?.error) {
        throw new Error(analysisData?.error || analysisError?.message || "Error analizando video");
      }
      setPipelineStep(5);

      // Generate images for each variant
      setPipelineStep(6);
      const variants: VariantResult[] = [];
      for (const variant of analysisData.variants) {
        try {
          const { data: imageData, error: imageError } = await supabase.functions.invoke("generate-variant-image", {
            body: {
              prompt: variant.base_image_prompt_9x16,
              scene_geometry: variant.scene_geometry,
              cover_url: downloadedData.cover_url,
              product_image_url: downloadedData.product_image_url,
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

      // Phase 3: Generate voiceover for each variant (if has_voice)
      if (analysisData.has_voice) {
        setPipelineStep(7); // "Generando voiceover"
        for (const v of variants) {
          try {
            const { data: voiceData, error: voiceError } = await supabase.functions.invoke("generate-voiceover", {
              body: {
                script: v.script,
                has_voice: analysisData.has_voice,
                content_type: analysisData.content_type,
                suggested_voice_gender: analysisData.suggested_voice_gender || "female",
                variant_id: v.variant_id,
              },
            });
            if (!voiceError && voiceData?.audio_url) {
              v.audio_url = voiceData.audio_url;
            }
          } catch (e) {
            console.error(`Voiceover error for ${v.variant_id}:`, e);
          }
        }
      }

      // Phase 4: Animate each variant with Infinitalk (if audio exists)
      // First, upload base64 images to storage so Infinitalk gets real URLs
      setPipelineStep(8); // "Animando video"
      for (const v of variants) {
        if (!v.audio_url || !v.generated_image_url) continue;

        // If image is base64, upload to storage first
        let imageUrl = v.generated_image_url;
        if (imageUrl.startsWith("data:")) {
          try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            const fileName = `variant_${v.variant_id}_${Date.now()}.png`;
            const { error: upErr } = await supabase.storage
              .from("videos")
              .upload(fileName, blob, { contentType: "image/png" });
            if (!upErr) {
              const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(fileName);
              imageUrl = pubUrl.publicUrl;
              v.generated_image_url = imageUrl; // update to real URL
            }
          } catch (e) {
            console.error(`Image upload error for ${v.variant_id}:`, e);
            continue;
          }
        }

        try {
          const { data: animData, error: animError } = await supabase.functions.invoke("animate-variant", {
            body: {
              image_url: imageUrl,
              audio_url: v.audio_url,
              prompt: v.hisfield_master_motion_prompt?.substring(0, 500) || "A person talking naturally while holding a product, TikTok style.",
            },
          });
          if (!animError && animData?.task_id) {
            v.animation_task_id = animData.task_id;
          }
        } catch (e) {
          console.error(`Animation error for ${v.variant_id}:`, e);
        }
      }

      // Phase 5: Poll animation tasks
      const pendingVariants = variants.filter(v => v.animation_task_id);
      if (pendingVariants.length > 0) {
        const maxPolls = 60; // max 5 minutes (5s intervals)
        for (let poll = 0; poll < maxPolls; poll++) {
          const allDone = pendingVariants.every(v => v.video_url);
          if (allDone) break;

          await new Promise(r => setTimeout(r, 5000));

          for (const v of pendingVariants) {
            if (v.video_url) continue;
            try {
              const { data: checkData } = await supabase.functions.invoke("check-animation-task", {
                body: { task_id: v.animation_task_id },
              });
              if (checkData?.status === "completed" && checkData?.video_url) {
                v.video_url = checkData.video_url;
              } else if (checkData?.status === "failed") {
                console.error(`Animation failed for ${v.variant_id}`);
                v.animation_task_id = undefined; // stop polling
              }
            } catch (e) {
              console.error(`Poll error for ${v.variant_id}:`, e);
            }
          }
        }
      }

      setPipelineStep(9); // "Listo"

      const analysisResults: AnalysisResult = {
        input_mode: analysisData.input_mode,
        has_voice: analysisData.has_voice,
        content_type: analysisData.content_type,
        suggested_voice_gender: analysisData.suggested_voice_gender,
        source_blueprint: analysisData.source_blueprint,
        variants,
      };

      setResults(analysisResults);
      setStep("results");
      await saveToHistory(downloadedData.originalUrl, downloadedData.variantCount, analysisResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      console.error("Pipeline error:", e);
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, [downloadedData]);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
    setError(null);
    setDownloadedData(null);
  }, []);

  const handleLoadFromHistory = useCallback((historyResults: AnalysisResult) => {
    setResults(historyResults);
    setStep("results");
  }, []);

  const stepLabels = ["Entrada", "Preview", "Análisis", "Resultados"];

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
                    (i === 1 && (step === "downloading" || step === "preview")) ||
                    (i === 2 && step === "processing") ||
                    (i === 3 && step === "results")
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
          {step === "downloading" && (
            <motion.div key="downloading" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <ProcessingPipeline currentStep={0} />
            </motion.div>
          )}
          {step === "preview" && downloadedData && (
            <motion.div key="preview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <CoverPreviewStep
                coverUrl={downloadedData.cover_url}
                productImageUrl={downloadedData.product_image_url}
                onConfirm={handleConfirmPreview}
                onCancel={handleReset}
              />
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
