import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import InputStep from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";
import CoverPreviewStep from "@/components/CoverPreviewStep";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppStep = "input" | "downloading" | "preview" | "processing" | "results";

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

interface DownloadedData {
  video_url: string;
  cover_url: string;
  metadata: Record<string, unknown>;
  product_image_url: string;
  variantCount: number;
  originalUrl: string;
}

const Index = () => {
  const { user } = useAuth();
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
        user_id: user?.id,
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
    setStep("downloading");
    setError(null);
    setPipelineStep(0);

    try {
      const { data: downloadData, error: downloadError } = await supabase.functions.invoke("download-tiktok", {
        body: { url: formData.url },
      });
      if (downloadError || downloadData?.error) {
        throw new Error(downloadData?.error || downloadError?.message || "Error descargando video");
      }

      let productImageUrl = "";
      if (formData.productImage) {
        const ext = formData.productImage.name.split(".").pop() || "png";
        const productFileName = `product_${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("videos")
          .upload(productFileName, formData.productImage, { contentType: formData.productImage.type });
        if (uploadErr) throw new Error("Error subiendo imagen del producto");
        const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(productFileName);
        productImageUrl = pubUrl.publicUrl;
      }

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
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, []);

  const handleConfirmPreview = useCallback(async () => {
    if (!downloadedData) return;
    setStep("processing");
    setPipelineStep(2);

    try {
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

      setPipelineStep(6);
      const variants: VariantResult[] = [];
      for (let i = 0; i < analysisData.variants.length; i++) {
        const variant = analysisData.variants[i];
        try {
          const { data: imageData, error: imageError } = await supabase.functions.invoke("generate-variant-image", {
            body: {
              prompt: variant.base_image_prompt_9x16,
              scene_geometry: variant.scene_geometry,
              cover_url: downloadedData.cover_url,
              product_image_url: downloadedData.product_image_url,
              variant_index: i,
              total_variants: analysisData.variants.length,
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
      await saveToHistory(downloadedData.originalUrl, downloadedData.variantCount, analysisResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, [downloadedData, user]);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
    setError(null);
    setDownloadedData(null);
  }, []);

  return (
    <div className="bg-background">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <InputStep onSubmit={handleSubmit} />
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
              <ResultsView results={results} videoUrl={downloadedData?.video_url || ""} videoDuration={downloadedData?.metadata?.duration as number | undefined} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
