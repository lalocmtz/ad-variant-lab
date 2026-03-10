import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import InputStep from "@/components/InputStep";
import type { VideoMode } from "@/components/InputStep";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import ResultsView from "@/components/ResultsView";
import CoverPreviewStep from "@/components/CoverPreviewStep";
import ContentModeStep from "@/components/ContentModeStep";
import type { ClassificationResult } from "@/components/ContentModeStep";
import BrollConfigPanel from "@/components/BrollConfigPanel";
import type { BrollConfig } from "@/components/BrollConfigPanel";
import BrollProcessingPipeline from "@/components/BrollProcessingPipeline";
import BrollResultsView from "@/components/BrollResultsView";
import type { BrollResults, BrollVariant } from "@/components/BrollResultsView";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppStep = "input" | "downloading" | "preview" | "classifying" | "mode_select" | "broll_config" | "broll_processing" | "broll_results" | "processing" | "results";

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
  avatar_instruction?: string;
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

export interface AnimationPromptPackage {
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
  guion_original_completo?: string;
  estructura_del_guion?: Record<string, string>;
  analisis_estructura_persuasiva?: { framework_detectado: string[]; explicacion_breve: string };
  triggers_psicologicos_detectados?: string[];
  actor_profile_observed: {
    gender_presentation: string;
    approx_age_band: string;
    creator_archetype: string;
    presence_style: string;
    market_context?: string;
    rol_del_creador?: string;
    perfil_de_confianza?: string;
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

export type VideoGenerationStatus = "idle" | "queued" | "processing" | "completed" | "failed";

export interface VariantResult {
  variant_id: string;
  identity_distance: string;
  variant_summary: string;
  actor_archetype: string;
  identity_replacement_rules?: string[];
  image_generation_strategy?: string[];
  actor_visual_direction: ActorVisualDirection;
  script_variant: ScriptVariant;
  on_screen_text_plan?: Array<{ timestamp: string; text: string }>;
  shotlist?: Array<{ shot: number; duration: string; description: string }>;
  scene_geometry: SceneGeometry;
  base_image_prompt_9x16: string;
  heygen_ready_brief: HeygenReadyBrief;
  negative_prompt: string;
  similarity_check_result: SimilarityCheckResult;
  status: VariantStatus;
  generation_attempt: number;
  generated_image_url: string;
  animation_prompt_json?: Record<string, unknown>;
  prompt_package?: AnimationPromptPackage;
  video_task_id?: string;
  video_status?: VideoGenerationStatus;
  video_url?: string;
  video_error?: string;
  video_mode?: string;
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
  accent: string;
  diversity_intensity: string;
}

function buildAnimationPromptPackage(
  variant: VariantResult,
  winnerBlueprint: WinnerBlueprint,
): AnimationPromptPackage {
  const promptJson = variant.animation_prompt_json || {
    video_metadata: {
      duracion_total_segundos_objetivo: "15",
      duracion_original_segundos: String(winnerBlueprint.duration_seconds),
      tipo_video: winnerBlueprint.scene_type || "",
      formato: "9:16 vertical",
      estilo_contenido: winnerBlueprint.performance_style || "",
      ritmo_video: "condensed_for_15_seconds",
    },
    analisis_estructura_persuasiva: winnerBlueprint.analisis_estructura_persuasiva || {
      framework_detectado: ["hook", "contexto", "demostracion", "beneficio", "cta"],
      explicacion_breve: "",
    },
    triggers_psicologicos_detectados: winnerBlueprint.triggers_psicologicos_detectados || [],
    configuracion_escena: {
      entorno_y_fondo: winnerBlueprint.scene_type || "",
      iluminacion: winnerBlueprint.scene_geometry?.lighting_direction || "",
      camara: winnerBlueprint.camera_style || "",
      angulo_camara: winnerBlueprint.scene_geometry?.camera_angle || "",
    },
    sujeto_principal: {
      tipo_persona: variant.actor_archetype || "",
      edad_aproximada: variant.actor_visual_direction?.approx_age_band || "",
      genero: variant.actor_visual_direction?.gender_presentation || "",
      apariencia_general: variant.actor_visual_direction?.overall_vibe || "",
      energia: variant.heygen_ready_brief?.energy || "",
      estilo_comunicacion: variant.heygen_ready_brief?.delivery_style || "",
      contexto_de_mercado: winnerBlueprint.actor_profile_observed?.market_context || "",
      rol_del_creador: winnerBlueprint.actor_profile_observed?.rol_del_creador || "",
      perfil_de_confianza: winnerBlueprint.actor_profile_observed?.perfil_de_confianza || "",
    },
    guion_original_completo: winnerBlueprint.guion_original_completo || "",
    estructura_del_guion: winnerBlueprint.estructura_del_guion || {},
    guion_variante_para_esta_imagen: {
      hook: variant.script_variant?.hook || "",
      body: variant.script_variant?.body || "",
      cta: variant.script_variant?.cta || "",
      guion_completo: variant.script_variant?.full_script || "",
    },
    instrucciones_para_recrear_el_video: {
      objetivo: "Recreate the same ad structure using this generated image/actor while preserving the original persuasion mechanics in exactly 15 seconds.",
      energia: variant.heygen_ready_brief?.energy || "",
      pace: variant.heygen_ready_brief?.pace || "",
      delivery_style: variant.heygen_ready_brief?.delivery_style || "",
      facial_expression: variant.heygen_ready_brief?.facial_expression || "",
      gesture_style: variant.heygen_ready_brief?.gesture_style || "",
    },
    linea_de_tiempo_15s: [
      { marca_de_tiempo: "0.0-2.5", duracion_segundos: "2.5", objetivo_persuasivo: "HOOK" },
      { marca_de_tiempo: "2.5-6.0", duracion_segundos: "3.5", objetivo_persuasivo: "REFRAME / CONTEXT" },
      { marca_de_tiempo: "6.0-10.5", duracion_segundos: "4.5", objetivo_persuasivo: "DEMO + VALUE PROOF" },
      { marca_de_tiempo: "10.5-12.5", duracion_segundos: "2.0", objetivo_persuasivo: "OBJECTION / PRICE" },
      { marca_de_tiempo: "12.5-15.0", duracion_segundos: "2.5", objetivo_persuasivo: "CTA" },
    ],
    restricciones_de_generacion: {
      usar_producto_subido_como_verdad_absoluta: true,
      preservar_mecanica_ganadora: true,
      preservar_contexto_de_mercado: true,
      preservar_rol_del_creador: true,
      preservar_perfil_de_confianza: true,
      no_clonar_actor_original: true,
      mantener_estilo_ugc_natural: true,
      no_hacer_traduccion_literal: true,
      duracion_objetivo_fija_15s: true,
      prohibir_texto_en_pantalla: true,
      prohibir_subtitulos: true,
      prohibir_comment_bubbles: true,
      prohibir_motion_graphics: true,
    },
  };

  const promptText = `Use the attached generated image as the visual identity reference for the actor.

Your task is to animate or recreate a vertical short-form UGC ad that preserves the same winning persuasion structure, creator role, trust profile, pacing logic, gestures, and conversion mechanics of the source ad.

This execution must be exactly 15 seconds long.

Important rules:
- use the uploaded product as absolute truth
- preserve the same broad market and creator plausibility as the original ad
- preserve the same creator role and trust profile unless explicitly changed by the user
- do not clone the original actor
- keep this generated actor identity
- preserve hook structure, delivery energy, body language rhythm, objection handling, and CTA logic
- compress the ad to exactly 15 seconds by keeping only the highest-conversion beats
- do not add on-screen text, subtitles, captions, comment bubbles, social UI, or motion graphics
- preserve the comment-reply mechanic only as spoken context if relevant, never as visible text
- keep the result natural, believable, handheld, and UGC-style

LANGUAGE RULES:
- All spoken dialogue and scripts MUST be in Spanish (Mexican Spanish by default).
- Use natural Mexican Spanish vocabulary, tone, and phrasing.
- The accent must be Mexican.
- Avoid Spain Spanish phrasing.
- Avoid unnatural "neutral corporate Spanish".
- If a script is provided in Spanish, preserve it — do NOT translate to English.
- Visual/technical instructions may remain in English for model quality.

Use the following JSON blueprint as the execution spec:

JSON:
${JSON.stringify(promptJson, null, 2)}`;

  return {
    variant_id: variant.variant_id,
    platform_target: "universal_video_generation",
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
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null);

  // Classification & broll state
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [brollResults, setBrollResults] = useState<BrollResults | null>(null);
  const [brollPipelineStep, setBrollPipelineStep] = useState(0);

  const saveToHistory = async (url: string, variantCount: number, analysisResults: AnalysisResult) => {
    try {
      const { data } = await supabase.from("analysis_history").insert([{
        tiktok_url: url,
        variant_count: variantCount,
        results: JSON.parse(JSON.stringify(analysisResults)),
        user_id: user?.id,
      }]).select("id").single();
      if (data?.id) setHistoryEntryId(data.id);
    } catch (e) {
      console.error("Failed to save to history:", e);
    }
  };

  const persistResultsToHistory = async (updatedResults: AnalysisResult) => {
    if (!historyEntryId) return;
    try {
      await supabase.from("analysis_history").update({
        results: JSON.parse(JSON.stringify(updatedResults)),
      }).eq("id", historyEntryId);
    } catch (e) {
      console.error("Failed to persist results to history:", e);
    }
  };

  const handleSubmit = useCallback(async (formData: {
    url: string;
    productImage: File | null;
    variantCount: number;
    videoMode: VideoMode;
    language: string;
    accent: string;
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
        accent: formData.accent,
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

  // After cover preview confirmation, classify the content
  const handleConfirmPreview = useCallback(async () => {
    if (!downloadedData) return;
    setStep("classifying");

    try {
      const { data: classData, error: classError } = await supabase.functions.invoke("classify-content", {
        body: {
          cover_url: downloadedData.cover_url,
          video_url: downloadedData.video_url,
          metadata: downloadedData.metadata,
        },
      });

      if (classError || classData?.error) {
        console.warn("Classification failed, defaulting to avatar:", classData?.error || classError?.message);
        // Default to avatar pipeline on classification failure
        setClassification({
          content_mode: "avatar",
          confidence: 0.5,
          recommended_pipeline: "avatar_variants",
          reasoning: "Clasificación no disponible — usando pipeline por defecto.",
          person_visibility_ratio: 0.5,
          product_visual_dominance: 0.5,
        });
      } else {
        setClassification(classData);
      }

      setStep("mode_select");
    } catch (e) {
      console.warn("Classification error, defaulting to avatar:", e);
      setClassification({
        content_mode: "avatar",
        confidence: 0.5,
        recommended_pipeline: "avatar_variants",
        reasoning: "Error en clasificación — pipeline por defecto.",
        person_visibility_ratio: 0.5,
        product_visual_dominance: 0.5,
      });
      setStep("mode_select");
    }
  }, [downloadedData]);

  // User selects mode after classification
  const handleSelectMode = useCallback((mode: "avatar" | "product_broll") => {
    if (mode === "avatar") {
      // Continue with existing avatar pipeline
      runAvatarPipeline();
    } else {
      // Show broll config
      setStep("broll_config");
    }
  }, [downloadedData]);

  // Avatar pipeline (existing flow)
  const runAvatarPipeline = useCallback(async () => {
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
          builtVariant.prompt_package = buildAnimationPromptPackage(builtVariant, winnerBp);
          variants.push(builtVariant);
        } catch {
          const failedVariant: VariantResult = { ...variant, generated_image_url: "", status: "needs_regeneration", generation_attempt: 1 };
          failedVariant.prompt_package = buildAnimationPromptPackage(failedVariant, winnerBp);
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

  // B-roll pipeline
  const handleStartBrollPipeline = useCallback(async (config: BrollConfig) => {
    if (!downloadedData) return;
    setStep("broll_processing");
    setBrollPipelineStep(0);

    try {
      // Step 1: Generate scripts
      setBrollPipelineStep(1);
      const { data: scriptData, error: scriptError } = await supabase.functions.invoke("generate-broll-scripts", {
        body: {
          video_url: downloadedData.video_url,
          cover_url: downloadedData.cover_url,
          metadata: downloadedData.metadata,
          variant_count: config.variant_count,
          language: config.language,
          accent: config.accent,
          tone: config.tone,
        },
      });

      if (scriptError || scriptData?.error) {
        throw new Error(scriptData?.error || scriptError?.message || "Error generando guiones");
      }

      // Step 2: Generate TTS audio for each variant
      setBrollPipelineStep(2);
      const variants: BrollVariant[] = [];

      for (const sv of scriptData.variants) {
        const brollVariant: BrollVariant = {
          ...sv,
          status: "generating_audio" as const,
        };

        try {
          const ttsResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-bof-voice`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                text: sv.script_text,
                language: config.language,
                accent: config.accent,
              }),
            }
          );

          if (!ttsResponse.ok) {
            throw new Error(`TTS failed: ${ttsResponse.status}`);
          }

          const audioBlob = await ttsResponse.blob();
          // Upload audio to storage
          const audioFileName = `broll_voice_${sv.variant_id}_${Date.now()}.mp3`;
          const { error: uploadErr } = await supabase.storage
            .from("videos")
            .upload(audioFileName, audioBlob, { contentType: "audio/mpeg" });

          if (uploadErr) throw new Error(`Audio upload failed: ${uploadErr.message}`);

          const { data: audioUrlData } = supabase.storage.from("videos").getPublicUrl(audioFileName);

          brollVariant.audio_url = audioUrlData.publicUrl;
          brollVariant.status = "ready";
        } catch (e) {
          console.error(`TTS failed for ${sv.variant_id}:`, e);
          brollVariant.status = "failed";
          brollVariant.error = e instanceof Error ? e.message : "Audio generation failed";
        }

        variants.push(brollVariant);
      }

      // Step 3: Done
      setBrollPipelineStep(3);

      const brollResult: BrollResults = {
        product_detected: scriptData.product_detected,
        scene_analysis: scriptData.scene_analysis,
        variants,
        master_video_url: downloadedData.video_url,
      };

      setBrollResults(brollResult);
      setBrollPipelineStep(4);
      setStep("broll_results");
      toast.success(`${variants.filter(v => v.status === "ready").length} voice-overs generados`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      toast.error(msg);
      setStep("input");
    }
  }, [downloadedData]);

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
        rebuilt.prompt_package = buildAnimationPromptPackage(rebuilt, results.winner_blueprint);
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

  const handleUpdateVariantVideoState = useCallback((variantIndex: number, videoState: { video_task_id?: string; video_status?: VideoGenerationStatus; video_url?: string; video_error?: string; video_mode?: string }) => {
    if (!results) return;
    const updatedVariants = [...results.variants];
    updatedVariants[variantIndex] = { ...updatedVariants[variantIndex], ...videoState };
    const updatedResults = { ...results, variants: updatedVariants };
    setResults(updatedResults);
    if (videoState.video_url || videoState.video_status === "completed" || videoState.video_status === "failed") {
      persistResultsToHistory(updatedResults);
    }
  }, [results, historyEntryId]);

  const handleRegenerateBrollVariant = useCallback(async (variantIndex: number) => {
    if (!brollResults || !downloadedData) return;
    const variant = brollResults.variants[variantIndex];
    if (!variant) return;

    const updatedVariants = [...brollResults.variants];
    updatedVariants[variantIndex] = { ...variant, status: "generating_audio" };
    setBrollResults({ ...brollResults, variants: updatedVariants });

    try {
      const ttsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-bof-voice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text: variant.script_text,
            language: "es-MX",
            accent: "mexicano",
          }),
        }
      );

      if (!ttsResponse.ok) throw new Error(`TTS failed: ${ttsResponse.status}`);

      const audioBlob = await ttsResponse.blob();
      const audioFileName = `broll_voice_${variant.variant_id}_${Date.now()}.mp3`;
      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(audioFileName, audioBlob, { contentType: "audio/mpeg" });

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      const { data: audioUrlData } = supabase.storage.from("videos").getPublicUrl(audioFileName);

      updatedVariants[variantIndex] = { ...variant, audio_url: audioUrlData.publicUrl, status: "ready", error: undefined };
      setBrollResults({ ...brollResults, variants: [...updatedVariants] });
      toast.success(`Audio ${variant.variant_id} regenerado`);
    } catch (e) {
      updatedVariants[variantIndex] = { ...variant, status: "failed", error: e instanceof Error ? e.message : "Error" };
      setBrollResults({ ...brollResults, variants: [...updatedVariants] });
      toast.error(`Error regenerando audio: ${e instanceof Error ? e.message : "Error"}`);
    }
  }, [brollResults, downloadedData]);

  const handleReset = useCallback(() => {
    setStep("input");
    setResults(null);
    setError(null);
    setDownloadedData(null);
    setHistoryEntryId(null);
    setClassification(null);
    setBrollResults(null);
    setBrollPipelineStep(0);
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
          {(step === "classifying") && (
            <motion.div key="classifying" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <ProcessingPipeline currentStep={1} />
            </motion.div>
          )}
          {step === "mode_select" && classification && downloadedData && (
            <motion.div key="mode_select" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <ContentModeStep
                classification={classification}
                coverUrl={downloadedData.cover_url}
                onSelectMode={handleSelectMode}
                onCancel={handleReset}
              />
            </motion.div>
          )}
          {step === "broll_config" && downloadedData && (
            <motion.div key="broll_config" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <BrollConfigPanel
                coverUrl={downloadedData.cover_url}
                onStart={handleStartBrollPipeline}
                onCancel={() => setStep("mode_select")}
              />
            </motion.div>
          )}
          {step === "broll_processing" && (
            <motion.div key="broll_processing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <BrollProcessingPipeline currentStep={brollPipelineStep} />
            </motion.div>
          )}
          {step === "broll_results" && brollResults && (
            <motion.div key="broll_results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <BrollResultsView
                results={brollResults}
                onReset={handleReset}
                onRegenerateVariant={handleRegenerateBrollVariant}
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
                language={downloadedData?.language || "es-MX"}
                accent={downloadedData?.accent || "mexicano"}
                onReset={handleReset}
                onRegenerateVariant={handleRegenerateVariant}
                onUpdateVariantStatus={handleUpdateVariantStatus}
                onUpdateVariantVideoState={handleUpdateVariantVideoState}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
