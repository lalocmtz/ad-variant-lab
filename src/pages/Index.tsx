import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import InputStep from "@/components/InputStep";
import type { VideoMode } from "@/components/InputStep";
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

export interface ActorVisualDirection {
  gender_presentation: string;
  approx_age_band: string;
  face_shape: string;
  hair_style: string;
  hair_color: string;
  skin_tone_range: string;
  overall_vibe: string;
  wardrobe: string;
}

export interface ScriptVariant {
  language: string;
  duration_target_seconds: number;
  hook: string;
  body: string;
  cta: string;
  full_script: string;
}

export interface HeygenReadyBrief {
  avatar_instruction: string;
  delivery_style: string;
  pace: string;
  energy: string;
  facial_expression: string;
  gesture_style: string;
}

export interface SimilarityCheckResult {
  against_original: "pass" | "fail";
  cross_variant_diversity: "pass" | "fail";
  product_lock: "pass" | "fail";
  mechanics_preserved: "pass" | "fail";
  notes: string[];
}

export interface PromptPackage {
  variant_id: string;
  platform_target: string;
  prompt_text: string;
  prompt_json: Record<string, unknown>;
}

export interface WinnerBlueprint {
  duration_seconds: number;
  primary_hook_type: string;
  primary_hook_label?: string;
  primary_hook_visual: string;
  primary_hook_verbal: string;
  core_emotion: string;
  energy_profile: string;
  performance_style: string;
  performance_mechanics?: string[];
  cta_style: string;
  conversion_mechanics: string[];
  scene_type: string;
  camera_style: string;
  gesture_profile: string;
  actor_profile_observed: {
    gender_presentation: string;
    approx_age_band: string;
    creator_archetype: string;
    presence_style: string;
    market_context?: string;
  };
  scene_geometry: SceneGeometry;
  beat_timeline: Array<{
    start_sec: number;
    end_sec: number;
    beat_type: string;
    description: string;
  }>;
}

export type VariantStatus = "ready" | "needs_regeneration" | "approved" | "rejected" | "pending";

export interface VariantResult {
  variant_id: string;
  identity_distance: string;
  variant_summary: string;
  actor_archetype: string;
  identity_replacement_rules?: string[];
  image_generation_strategy?: string[];
  actor_visual_direction: ActorVisualDirection;
  script_variant: ScriptVariant;
  on_screen_text_plan: Array<{ timestamp: string; text: string }>;
  shotlist: Array<{ shot: number; duration: string; description: string }>;
  scene_geometry: SceneGeometry;
  base_image_prompt_9x16: string;
  heygen_ready_brief: HeygenReadyBrief;
  negative_prompt: string;
  similarity_check_result: SimilarityCheckResult;
  status: VariantStatus;
  generation_attempt: number;
  generated_image_url: string;
  prompt_package?: PromptPackage;
}

export interface AnalysisResult {
  input_mode: string;
  has_voice: boolean;
  content_type: string;
  overlay_cleanup_required?: boolean;
  clean_frame_strategy?: string;
  winner_blueprint: WinnerBlueprint;
  variants: VariantResult[];
}

interface DownloadedData {
  video_url: string;
  cover_url: string;
  metadata: Record<string, unknown>;
  product_image_url: string;
  variantCount: number;
  originalUrl: string;
  videoMode: VideoMode;
  language: string;
  diversity_intensity: string;
}

function buildPromptPackage(
  variant: VariantResult,
  winnerBlueprint: WinnerBlueprint,
): PromptPackage {
  const promptJson = {
    language: variant.script_variant?.language || "es-MX",
    product_lock: { use_uploaded_product_as_absolute_truth: true },
    winner_blueprint: {
      duration_seconds: winnerBlueprint.duration_seconds,
      primary_hook_type: winnerBlueprint.primary_hook_type,
      primary_hook_label: winnerBlueprint.primary_hook_label || "",
      primary_hook_visual: winnerBlueprint.primary_hook_visual || "",
      primary_hook_verbal: winnerBlueprint.primary_hook_verbal || "",
      core_emotion: winnerBlueprint.core_emotion,
      energy_profile: winnerBlueprint.energy_profile,
      performance_style: winnerBlueprint.performance_style,
      cta_style: winnerBlueprint.cta_style,
      conversion_mechanics: winnerBlueprint.conversion_mechanics,
      scene_type: winnerBlueprint.scene_type,
      camera_style: winnerBlueprint.camera_style,
      gesture_profile: winnerBlueprint.gesture_profile || "",
      performance_mechanics: winnerBlueprint.performance_mechanics || [],
      actor_profile_observed: winnerBlueprint.actor_profile_observed,
      scene_geometry: winnerBlueprint.scene_geometry,
      beat_timeline: winnerBlueprint.beat_timeline,
    },
    variant_actor_direction: {
      identity_distance: "high",
      market_plausibility_mode: "preserve_original_context",
      keep_same_broad_audience_fit: true,
      avoid_unrelated_demographic_shift: true,
      ...variant.actor_visual_direction,
    },
    delivery: {
      energy: variant.heygen_ready_brief?.energy || "",
      pace: variant.heygen_ready_brief?.pace || "",
      facial_expression: variant.heygen_ready_brief?.facial_expression || "",
      gesture_style: variant.heygen_ready_brief?.gesture_style || "",
      delivery_style: variant.heygen_ready_brief?.delivery_style || "",
    },
    script_variant: {
      hook: variant.script_variant?.hook || "",
      body: variant.script_variant?.body || "",
      cta: variant.script_variant?.cta || "",
      full_script: variant.script_variant?.full_script || "",
    },
    constraints: [
      "preserve exact uploaded product",
      "preserve ad mechanics",
      "preserve same broad market plausibility",
      "do not clone original actor",
      "do not translate literally",
      "keep natural spoken wording",
      "keep target duration",
    ],
  };

  const promptText = `Generate a realistic vertical UGC video/image variation based on the attached reference image and product reference.

Goal:
Preserve the winning ad mechanics of the source TikTok ad while using a clearly different actor who still fits the same broad market context as the original creator.

Instructions:
- use the uploaded product as absolute truth
- preserve the winner's hook intention, energy, action, framing logic, and CTA structure
- use a clearly different actor identity
- keep the same broad regional / market plausibility as the original creator
- do not introduce an unrelated demographic shift
- do not clone the original actor
- keep the result natural, handheld, UGC-style, and believable
- use the following JSON as the execution spec

JSON:
${JSON.stringify(promptJson, null, 2)}`;

  return {
    variant_id: variant.variant_id,
    platform_target: "aigen_or_sora",
    prompt_text: promptText,
    prompt_json: promptJson,
  };
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
    variantCount: number;
    videoMode: VideoMode;
    language: string;
    diversity_intensity: string;
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
        videoMode: formData.videoMode,
        language: formData.language,
        diversity_intensity: formData.diversity_intensity,
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
          video_mode: downloadedData.videoMode,
          language: downloadedData.language,
          diversity_intensity: downloadedData.diversity_intensity,
        },
      });
      if (analysisError || analysisData?.error) {
        throw new Error(analysisData?.error || analysisError?.message || "Error analizando video");
      }
      setPipelineStep(5);

      const overlayCleanup = analysisData.overlay_cleanup_required || false;
      const winnerBp: WinnerBlueprint = analysisData.winner_blueprint;

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
              video_mode: downloadedData.videoMode,
              actor_visual_direction: variant.actor_visual_direction,
              negative_prompt: variant.negative_prompt,
              identity_replacement_rules: variant.identity_replacement_rules,
              overlay_cleanup_required: overlayCleanup,
            },
          });
          const builtVariant: VariantResult = {
            ...variant,
            status: variant.status || "ready",
            generation_attempt: variant.generation_attempt || 1,
            generated_image_url: imageError || imageData?.error ? "" : imageData.image_url,
          };
          builtVariant.prompt_package = buildPromptPackage(builtVariant, winnerBp);
          variants.push(builtVariant);
        } catch {
          const failedVariant: VariantResult = { ...variant, generated_image_url: "", status: "needs_regeneration", generation_attempt: 1 };
          failedVariant.prompt_package = buildPromptPackage(failedVariant, winnerBp);
          variants.push(failedVariant);
        }
      }
      setPipelineStep(7);

      const analysisResults: AnalysisResult = {
        input_mode: analysisData.input_mode,
        has_voice: analysisData.has_voice,
        content_type: analysisData.content_type,
        overlay_cleanup_required: overlayCleanup,
        clean_frame_strategy: analysisData.clean_frame_strategy,
        winner_blueprint: winnerBp,
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

  const handleRegenerateVariant = useCallback(async (variantIndex: number) => {
    if (!results || !downloadedData) return;
    const variant = results.variants[variantIndex];
    if (!variant) return;

    const updatedVariants = [...results.variants];
    updatedVariants[variantIndex] = {
      ...variant,
      status: "pending" as VariantStatus,
      generation_attempt: variant.generation_attempt + 1,
    };
    setResults({ ...results, variants: updatedVariants });

    try {
      const { data: imageData, error: imageError } = await supabase.functions.invoke("generate-variant-image", {
        body: {
          prompt: variant.base_image_prompt_9x16,
          scene_geometry: variant.scene_geometry,
          cover_url: downloadedData.cover_url,
          product_image_url: downloadedData.product_image_url,
          variant_index: variantIndex,
          total_variants: results.variants.length,
          video_mode: downloadedData.videoMode,
          actor_visual_direction: variant.actor_visual_direction,
          negative_prompt: variant.negative_prompt,
          identity_replacement_rules: variant.identity_replacement_rules,
          overlay_cleanup_required: results.overlay_cleanup_required,
          is_regeneration: true,
        },
      });

      if (imageError || imageData?.error) {
        updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], status: "needs_regeneration" };
      } else {
        const rebuilt = { ...updatedVariants[variantIndex], generated_image_url: imageData.image_url, status: "ready" as VariantStatus };
        rebuilt.prompt_package = buildPromptPackage(rebuilt, results.winner_blueprint);
        updatedVariants[variantIndex] = rebuilt;
      }
      setResults({ ...results, variants: [...updatedVariants] });
    } catch {
      updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], status: "needs_regeneration" };
      setResults({ ...results, variants: [...updatedVariants] });
    }
  }, [results, downloadedData]);

  const handleUpdateVariantStatus = useCallback((variantIndex: number, newStatus: VariantStatus) => {
    if (!results) return;
    const updatedVariants = [...results.variants];
    updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], status: newStatus };
    setResults({ ...results, variants: updatedVariants });
  }, [results]);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
    setError(null);
    setDownloadedData(null);
  }, []);

  return (
    <div className="bg-background">
      <main className="mx-auto max-w-5xl px-8 py-8">
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
              <ResultsView
                results={results}
                videoUrl={downloadedData?.video_url || ""}
                videoDuration={downloadedData?.metadata?.duration as number | undefined}
                videoMode={downloadedData?.videoMode}
                onReset={handleReset}
                onRegenerateVariant={handleRegenerateVariant}
                onUpdateVariantStatus={handleUpdateVariantStatus}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
