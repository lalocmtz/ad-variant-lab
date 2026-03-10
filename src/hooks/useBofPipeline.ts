import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BofFormData, BofVariantResult, BofSceneImage } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

type BofStep = "input" | "processing" | "results";

const SCENES_PER_VARIANT = 3;
const POLL_INTERVAL = 8000;
const MAX_POLLS = 60; // ~8 min max

// Pipeline step indices (matches BofPipeline.tsx order)
const STEP_SCRIPTS = 0;
const STEP_SCENES = 1;
const STEP_IMAGES = 2;
const STEP_ANIMATE = 3;
const STEP_STITCH = 4;
const STEP_VOICE = 5;
const STEP_MERGE = 6;

function emptyVariant(id: string, batchId: string, formatId: string, scriptText: string): BofVariantResult {
  return {
    id, batch_id: batchId, format_id: formatId,
    format_name: getFormatById(formatId)?.format_name || formatId,
    script_text: scriptText, visual_prompt: "", generated_image_url: "",
    raw_video_url: "", voice_audio_url: "", final_video_url: "",
    status: "script_ready", error_message: "",
    scene_images: [], clip_urls: [],
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export function useBofPipeline() {
  const { user } = useAuth();
  const [step, setStep] = useState<BofStep>("input");
  const [pipelineStep, setPipelineStep] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [variants, setVariants] = useState<BofVariantResult[]>([]);
  const [productName, setProductName] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);

  // Poll a single animation task until complete
  const pollClipTask = useCallback(async (taskId: string): Promise<string | null> => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL);
      try {
        const { data, error } = await supabase.functions.invoke("get-video-task", {
          body: { taskId, engine: "wan" },
        });
        if (error) { console.error("Poll error:", error); continue; }
        if (data?.status === "completed" && data?.videoUrl) return data.videoUrl;
        if (data?.shouldStopPolling) {
          console.error("Clip failed:", data?.error);
          return null;
        }
      } catch (e) { console.error("Poll exception:", e); }
    }
    return null;
  }, []);

  // Generate voice for a single variant (returns audio URL or null)
  const generateVoice = useCallback(async (scriptText: string, language: string, accent: string, variantIndex: number): Promise<string | null> => {
    try {
      const voiceResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-bof-voice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: scriptText, language, accent }),
        }
      );
      if (!voiceResponse.ok) throw new Error(`TTS failed: ${voiceResponse.status}`);
      const audioBlob = await voiceResponse.blob();
      const audioFileName = `bof_voice_${Date.now()}_${variantIndex}.mp3`;
      const { error: audioUploadErr } = await supabase.storage
        .from("videos")
        .upload(audioFileName, audioBlob, { contentType: "audio/mpeg" });
      if (audioUploadErr) throw new Error("Error uploading voice audio");
      const { data: audioUrl } = supabase.storage.from("videos").getPublicUrl(audioFileName);
      return audioUrl.publicUrl;
    } catch (e: any) {
      console.error("Voice error for variant", variantIndex, e);
      return null;
    }
  }, []);

  const handleSubmit = useCallback(async (formData: BofFormData) => {
    if (!user) { toast.error("Inicia sesión primero"); return; }
    setIsLoading(true);
    setStep("processing");
    setPipelineStep(STEP_SCRIPTS);
    setStatusMessage("Preparando pipeline…");
    setProductName(formData.product_name);

    try {
      // === STEP 0: Upload product image ===
      const ext = formData.product_image!.name.split(".").pop() || "png";
      const fileName = `bof_product_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(fileName, formData.product_image!, { contentType: formData.product_image!.type });
      if (uploadErr) throw new Error("Error subiendo imagen del producto");
      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(fileName);
      const productImageUrl = pubUrl.publicUrl;

      // Create batch
      const { data: batchData, error: batchErr } = await supabase.from("bof_video_batches").insert([{
        user_id: user.id,
        product_name: formData.product_name,
        product_image_url: productImageUrl,
        metadata_json: {
          current_price: formData.current_price, old_price: formData.old_price,
          main_benefit: formData.main_benefit, offer: formData.offer,
          pain_point: formData.pain_point, audience: formData.audience,
          language: formData.language, accent: formData.accent,
        },
        selected_formats: formData.selected_formats,
        status: "generating_scripts",
      }]).select("id").single();
      if (batchErr || !batchData) throw new Error("Error creando batch");
      setBatchId(batchData.id);

      // === STEP 1: Generate scripts ===
      setPipelineStep(STEP_SCRIPTS);
      setStatusMessage("Generando scripts creativos…");
      const { data: scriptsData, error: scriptsErr } = await supabase.functions.invoke("generate-bof-scripts", {
        body: {
          product_name: formData.product_name, product_image_url: productImageUrl,
          current_price: formData.current_price, old_price: formData.old_price,
          main_benefit: formData.main_benefit, offer: formData.offer,
          pain_point: formData.pain_point, audience: formData.audience,
          selected_formats: formData.selected_formats,
          language: formData.language, accent: formData.accent,
        },
      });
      if (scriptsErr || scriptsData?.error) throw new Error(scriptsData?.error || scriptsErr?.message || "Error generando scripts");

      const scripts = scriptsData.scripts || [];

      // Create variant DB records
      const variantInserts = scripts.map((s: any) => ({
        batch_id: batchData.id, user_id: user.id,
        format_id: s.format_id, script_text: s.script_text, status: "script_ready",
      }));
      const { data: variantRows, error: variantErr } = await supabase.from("bof_video_variants").insert(variantInserts).select();
      if (variantErr) throw new Error("Error guardando variantes");

      let currentVariants: BofVariantResult[] = (variantRows || []).map((v: any) =>
        emptyVariant(v.id, v.batch_id, v.format_id, v.script_text)
      );
      setVariants([...currentVariants]);

      // === STEP 2: Generate scene images (3 per variant) ===
      setPipelineStep(STEP_IMAGES);
      setStatusMessage("Generando imágenes de escenas…");

      for (let vi = 0; vi < currentVariants.length; vi++) {
        const v = currentVariants[vi];
        const format = getFormatById(v.format_id);
        const scenePlan = format?.scene_plan || ["Product close-up", "Product in use", "CTA moment"];
        const sceneImages: BofSceneImage[] = [];

        for (let si = 0; si < Math.min(scenePlan.length, SCENES_PER_VARIANT); si++) {
          setStatusMessage(`Variante ${vi + 1}/${currentVariants.length} — Escena ${si + 1}/${Math.min(scenePlan.length, SCENES_PER_VARIANT)}`);
          try {
            const { data: imgData, error: imgErr } = await supabase.functions.invoke("generate-bof-images", {
              body: {
                product_image_url: productImageUrl,
                product_name: formData.product_name,
                script_text: v.script_text,
                format_id: v.format_id,
                scene_plan: [scenePlan[si]],
                camera_rules: format?.camera_rules,
                background_rules: format?.background_rules,
              },
            });
            if (imgErr || imgData?.error) {
              console.error(`Scene ${si} image failed:`, imgData?.error || imgErr);
              sceneImages.push({
                scene_index: si, scene_label: scenePlan[si],
                image_url: "", public_url: "", clip_task_id: "", clip_url: "",
                clip_status: "failed",
              });
            } else {
              sceneImages.push({
                scene_index: si, scene_label: scenePlan[si],
                image_url: imgData.image_url || "",
                public_url: "",
                clip_task_id: "", clip_url: "",
                clip_status: "pending",
              });
            }
          } catch (e: any) {
            console.error(`Scene ${si} error:`, e);
            sceneImages.push({
              scene_index: si, scene_label: scenePlan[si],
              image_url: "", public_url: "", clip_task_id: "", clip_url: "",
              clip_status: "failed",
            });
          }
        }

        currentVariants[vi] = {
          ...currentVariants[vi],
          scene_images: sceneImages,
          generated_image_url: sceneImages.find(s => s.image_url)?.image_url || "",
          status: sceneImages.some(s => s.image_url) ? "image_ready" : "failed",
          error_message: sceneImages.every(s => !s.image_url) ? "No se pudieron generar imágenes" : "",
        };
        setVariants([...currentVariants]);

        await supabase.from("bof_video_variants").update({
          generated_image_url: currentVariants[vi].generated_image_url,
          status: currentVariants[vi].status,
          error_message: currentVariants[vi].error_message,
        }).eq("id", currentVariants[vi].id);
      }

      // === STEP 3+5: Animate scenes + Generate voice IN PARALLEL ===
      setPipelineStep(STEP_ANIMATE);
      setStatusMessage("Animando escenas y generando voz en paralelo…");

      // --- Start all animation tasks ---
      const animationTasks: { vi: number; si: number; taskId: string }[] = [];

      for (let vi = 0; vi < currentVariants.length; vi++) {
        if (currentVariants[vi].status === "failed") continue;
        const scenes = currentVariants[vi].scene_images;

        for (let si = 0; si < scenes.length; si++) {
          if (!scenes[si].image_url || scenes[si].clip_status === "failed") continue;

          const motionPrompts = [
            "Slow zoom in with subtle handheld drift. Natural breathing motion. Keep product sharp and centered.",
            "Gentle pan left to right revealing the product. Smooth cinematic movement. Soft focus shift.",
            "Slow push in with slight perspective rotation. Intimate close-up feel. Warm natural lighting.",
          ];

          try {
            const { data: animData, error: animErr } = await supabase.functions.invoke("animate-bof-scene", {
              body: {
                image_url: scenes[si].image_url,
                motion_prompt: motionPrompts[si % motionPrompts.length],
                scene_index: si,
                engine: "wan", // Wan 2.6 Flash as default
              },
            });
            if (animErr || animData?.error) {
              console.error(`Animation failed for V${vi} S${si}:`, animData?.error || animErr);
              currentVariants[vi].scene_images[si].clip_status = "failed";
            } else {
              currentVariants[vi].scene_images[si].clip_task_id = animData.taskId;
              currentVariants[vi].scene_images[si].public_url = animData.public_image_url || "";
              currentVariants[vi].scene_images[si].clip_status = "animating";
              animationTasks.push({ vi, si, taskId: animData.taskId });
            }
          } catch (e: any) {
            console.error(`Animation error V${vi} S${si}:`, e);
            currentVariants[vi].scene_images[si].clip_status = "failed";
          }
        }

        currentVariants[vi] = { ...currentVariants[vi], status: "animating" };
        setVariants([...currentVariants]);
      }

      // --- Launch voice generation for all variants (parallel with animation polling) ---
      const voicePromises = currentVariants.map((v, i) => {
        if (v.status === "failed") return Promise.resolve(null);
        return generateVoice(v.script_text, formData.language, formData.accent, i);
      });

      // --- Poll all animation tasks (parallel with voice) ---
      const animationPromise = (async () => {
        if (animationTasks.length === 0) return [];
        setStatusMessage(`Esperando ${animationTasks.length} clips de animación…`);
        const pollPromises = animationTasks.map(async (task) => {
          const clipUrl = await pollClipTask(task.taskId);
          return { ...task, clipUrl };
        });
        return Promise.all(pollPromises);
      })();

      // Wait for BOTH animation polling and voice generation to finish
      const [pollResults, voiceResults] = await Promise.all([animationPromise, Promise.all(voicePromises)]);

      // --- Apply animation results ---
      for (const result of pollResults) {
        const scene = currentVariants[result.vi].scene_images[result.si];
        if (result.clipUrl) {
          scene.clip_url = result.clipUrl;
          scene.clip_status = "completed";
        } else {
          scene.clip_status = "failed";
        }
      }

      // === STEP 4: Stitch clips ===
      setPipelineStep(STEP_STITCH);
      setStatusMessage("Organizando clips…");

      for (let vi = 0; vi < currentVariants.length; vi++) {
        const scenes = currentVariants[vi].scene_images;
        const completedClips = scenes.filter(s => s.clip_status === "completed").map(s => s.clip_url);
        currentVariants[vi].clip_urls = completedClips;

        if (completedClips.length > 0) {
          currentVariants[vi].raw_video_url = completedClips[0]; // First clip as preview
          currentVariants[vi].status = "clips_ready";
        } else if (currentVariants[vi].status === "animating") {
          currentVariants[vi].status = "image_ready";
        }
      }
      setVariants([...currentVariants]);

      // --- Apply voice results ---
      setPipelineStep(STEP_VOICE);
      setStatusMessage("Aplicando locuciones…");

      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status === "failed") continue;
        const voiceUrl = voiceResults[i];
        if (voiceUrl) {
          currentVariants[i] = { ...currentVariants[i], voice_audio_url: voiceUrl, status: "voice_ready" };
        } else {
          currentVariants[i] = { ...currentVariants[i], status: "voice_ready" }; // Voice optional
        }
        setVariants([...currentVariants]);

        await supabase.from("bof_video_variants").update({
          voice_audio_url: currentVariants[i].voice_audio_url,
          status: currentVariants[i].status,
        }).eq("id", currentVariants[i].id);
      }

      // === STEP 6: Merge / Finalize ===
      setPipelineStep(STEP_MERGE);
      setStatusMessage("Finalizando…");

      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status !== "failed") {
          currentVariants[i] = { ...currentVariants[i], status: "completed" };
        }
      }
      setVariants([...currentVariants]);

      await supabase.from("bof_video_batches").update({ status: "completed" }).eq("id", batchData.id);
      for (const v of currentVariants) {
        await supabase.from("bof_video_variants").update({
          status: v.status,
          raw_video_url: v.raw_video_url,
        }).eq("id", v.id);
      }

      setStep("results");
      toast.success(`${currentVariants.filter(v => v.status === "completed").length} variantes BOF generadas`);
    } catch (e: any) {
      console.error("BOF pipeline error:", e);
      toast.error(e.message || "Error en el pipeline BOF");
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  }, [user, pollClipTask, generateVoice]);

  const handleRegenerateVariant = useCallback(async (index: number) => {
    toast.info("La regeneración individual estará disponible pronto.");
  }, []);

  const handleDuplicateStyle = useCallback((index: number) => {
    const variant = variants[index];
    if (!variant) return;
    navigator.clipboard.writeText(JSON.stringify({
      format_id: variant.format_id,
      script_text: variant.script_text,
      visual_prompt: variant.visual_prompt,
      scene_images: variant.scene_images.map(s => ({ label: s.scene_label, clip_url: s.clip_url })),
    }, null, 2));
    toast.success("Estilo copiado al clipboard");
  }, [variants]);

  const handleReset = useCallback(() => {
    setStep("input");
    setVariants([]);
    setBatchId(null);
    setIsLoading(false);
    setPipelineStep(0);
    setStatusMessage("");
  }, []);

  return {
    step, pipelineStep, statusMessage, isLoading, variants,
    productName, batchId,
    handleSubmit, handleRegenerateVariant, handleDuplicateStyle, handleReset,
  };
}
