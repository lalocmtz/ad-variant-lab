import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BofFormData, BofVariantResult, BofSceneImage, BofStep } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

const SCENES_PER_VARIANT = 3;
const POLL_INTERVAL = 8000;
const MAX_POLLS = 60;

// Pipeline step indices (matches BofPipeline.tsx PIPELINE_STEPS order)
const STEP_SCRIPTS = 0;
const STEP_IMAGES = 1;
const STEP_APPROVAL = 2; // pause here
const STEP_ANIMATE = 3;

function emptyVariant(id: string, batchId: string, formatId: string, scriptText: string): BofVariantResult {
  return {
    id, batch_id: batchId, format_id: formatId,
    format_name: getFormatById(formatId)?.format_name || formatId,
    script_text: scriptText, visual_prompt: "", generated_image_url: "",
    raw_video_url: "", voice_audio_url: "", final_video_url: "",
    final_merged_url: "",
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
  const [regeneratingScenes, setRegeneratingScenes] = useState<Set<string>>(new Set());

  // Store form data for phase 2
  const formDataRef = useRef<BofFormData | null>(null);
  const productImageUrlRef = useRef<string>("");

  const pollClipTask = useCallback(async (taskId: string): Promise<string | null> => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL);
      try {
        const { data, error } = await supabase.functions.invoke("get-video-task", {
          body: { taskId, engine: "sora2" },
        });
        if (error) { console.error("Poll error:", error); continue; }
        if (data?.status === "completed" && data?.videoUrl) return data.videoUrl;
        if (data?.shouldStopPolling) { console.error("Clip failed:", data?.error); return null; }
      } catch (e) { console.error("Poll exception:", e); }
    }
    return null;
  }, []);


  // Build rich animation prompt using format data
  const buildAnimationPrompt = useCallback((variant: BofVariantResult, sceneIndex: number, productNameStr: string, formData: BofFormData) => {
    const format = getFormatById(variant.format_id);
    const scene = variant.scene_images[sceneIndex];
    const cameraRules = format?.camera_rules || ["handheld", "phone aesthetic"];
    const bgRules = format?.background_rules || ["casual home setting"];

    return `CONTEXT: This is a TikTok Shop sales video ad for "${productNameStr}".
SCRIPT BEING NARRATED: "${variant.script_text}"
CURRENT SCENE: ${scene?.scene_label || `Scene ${sceneIndex + 1}`}
PRODUCT BENEFIT: ${formData.main_benefit || "great value product"}
PRICE: ${formData.current_price || ""}${formData.old_price ? ` (antes ${formData.old_price})` : ""}

CAMERA DIRECTION:
${cameraRules.map(r => `- ${r}`).join("\n")}

ENVIRONMENT:
${bgRules.map(r => `- ${r}`).join("\n")}

ANIMATION INSTRUCTIONS:
- Animate with realistic handheld smartphone motion — subtle drift, breathing shake, natural imperfection.
- ${sceneIndex === 0 ? "Slow zoom in to build attention. Hook moment — dramatic and eye-catching." : ""}
- ${sceneIndex === 1 ? "Gentle pan or reveal movement. Show the product in context. Demonstrate value." : ""}
- ${sceneIndex === 2 ? "Push in for urgency. CTA energy — make the viewer want to buy NOW." : ""}
- Keep the product sharp and clearly visible at all times.
- Natural lighting shifts — no studio look.
- Duration: approximately 9 seconds.
- No text, no overlays, no graphics, no watermarks. Clean UGC smartphone video only.
- Vertical 9:16 format.`;
  }, []);

  // ═══════════════════════════════════
  // PHASE 1: Scripts → Images → Approval
  // ═══════════════════════════════════
  const handleSubmit = useCallback(async (formData: BofFormData) => {
    if (!user) { toast.error("Inicia sesión primero"); return; }
    setIsLoading(true);
    setStep("processing");
    setPipelineStep(STEP_SCRIPTS);
    setStatusMessage("Preparando pipeline…");
    setProductName(formData.product_name);
    formDataRef.current = formData;

    try {
      // Upload product image
      const ext = formData.product_image!.name.split(".").pop() || "png";
      const fileName = `bof_product_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(fileName, formData.product_image!, { contentType: formData.product_image!.type });
      if (uploadErr) throw new Error("Error subiendo imagen del producto");
      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(fileName);
      const productImageUrl = pubUrl.publicUrl;
      productImageUrlRef.current = productImageUrl;

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

      // === STEP 2: Generate scene images ===
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
              sceneImages.push({
                scene_index: si, scene_label: scenePlan[si],
                image_url: "", public_url: "", clip_task_id: "", clip_url: "",
                clip_status: "failed", approved: false,
              });
            } else {
              sceneImages.push({
                scene_index: si, scene_label: scenePlan[si],
                image_url: imgData.image_url || "",
                public_url: "", clip_task_id: "", clip_url: "",
                clip_status: "pending", approved: false,
              });
            }
          } catch (e: any) {
            sceneImages.push({
              scene_index: si, scene_label: scenePlan[si],
              image_url: "", public_url: "", clip_task_id: "", clip_url: "",
              clip_status: "failed", approved: false,
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
      }

      // Update batch status
      await supabase.from("bof_video_batches").update({ status: "awaiting_approval" }).eq("id", batchData.id);

      // === PAUSE: Go to approval ===
      setStep("approval");
      setIsLoading(false);
      toast.success("Imágenes generadas — revisa y aprueba antes de animar");
    } catch (e: any) {
      console.error("BOF pipeline phase 1 error:", e);
      toast.error(e.message || "Error en el pipeline BOF");
      setStep("input");
      setIsLoading(false);
    }
  }, [user]);

  // ═══════════════════════════════════
  // APPROVAL HANDLERS
  // ═══════════════════════════════════
  const handleApproveScene = useCallback((variantIndex: number, sceneIndex: number) => {
    setVariants(prev => {
      const updated = [...prev];
      if (updated[variantIndex]?.scene_images[sceneIndex]) {
        updated[variantIndex] = { ...updated[variantIndex] };
        updated[variantIndex].scene_images = [...updated[variantIndex].scene_images];
        updated[variantIndex].scene_images[sceneIndex] = {
          ...updated[variantIndex].scene_images[sceneIndex],
          approved: true,
        };
      }
      return updated;
    });
  }, []);

  const handleRegenerateScene = useCallback(async (variantIndex: number, sceneIndex: number) => {
    const formData = formDataRef.current;
    if (!formData) return;

    const key = `${variantIndex}-${sceneIndex}`;
    setRegeneratingScenes(prev => new Set(prev).add(key));

    try {
      const variant = variants[variantIndex];
      const format = getFormatById(variant.format_id);
      const scenePlan = format?.scene_plan || ["Product close-up", "Product in use", "CTA moment"];

      const { data: imgData, error: imgErr } = await supabase.functions.invoke("generate-bof-images", {
        body: {
          product_image_url: productImageUrlRef.current,
          product_name: formData.product_name,
          script_text: variant.script_text,
          format_id: variant.format_id,
          scene_plan: [scenePlan[sceneIndex]],
          camera_rules: format?.camera_rules,
          background_rules: format?.background_rules,
        },
      });

      if (imgErr || imgData?.error) throw new Error(imgData?.error || "Error regenerando");

      setVariants(prev => {
        const updated = [...prev];
        updated[variantIndex] = { ...updated[variantIndex] };
        updated[variantIndex].scene_images = [...updated[variantIndex].scene_images];
        updated[variantIndex].scene_images[sceneIndex] = {
          ...updated[variantIndex].scene_images[sceneIndex],
          image_url: imgData.image_url || "",
          clip_status: "pending",
          approved: false,
        };
        return updated;
      });
      toast.success(`Escena ${sceneIndex + 1} regenerada`);
    } catch (e: any) {
      toast.error(e.message || "Error regenerando escena");
    } finally {
      setRegeneratingScenes(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [variants]);

  // ═══════════════════════════════════
  // PHASE 2: Animate + Voice + Merge
  // ═══════════════════════════════════
  const handleContinueAfterApproval = useCallback(async () => {
    const formData = formDataRef.current;
    if (!formData) return;

    setStep("processing_phase2");
    setIsLoading(true);
    setPipelineStep(STEP_ANIMATE);
    setStatusMessage("Animando escenas y generando voz en paralelo…");

    try {
      let currentVariants = [...variants];

      // Mark approved variants
      for (let vi = 0; vi < currentVariants.length; vi++) {
        if (currentVariants[vi].status !== "failed") {
          currentVariants[vi] = { ...currentVariants[vi], status: "approved" };
        }
      }
      setVariants([...currentVariants]);

      // --- Start all animation tasks ---
      const animationTasks: { vi: number; si: number; taskId: string }[] = [];

      for (let vi = 0; vi < currentVariants.length; vi++) {
        if (currentVariants[vi].status === "failed") continue;
        const scenes = currentVariants[vi].scene_images;

        for (let si = 0; si < scenes.length; si++) {
          if (!scenes[si].image_url || scenes[si].clip_status === "failed" || !scenes[si].approved) continue;

          const motionPrompt = buildAnimationPrompt(currentVariants[vi], si, formData.product_name, formData);

          try {
            const { data: animData, error: animErr } = await supabase.functions.invoke("animate-bof-scene", {
              body: {
                image_url: scenes[si].image_url,
                motion_prompt: motionPrompt,
                scene_index: si,
              },
            });
            if (animErr || animData?.error) {
              console.error(`Animation failed V${vi} S${si}:`, animData?.error || animErr);
              currentVariants[vi].scene_images[si].clip_status = "failed";
            } else {
              currentVariants[vi].scene_images[si].clip_task_id = animData.taskId;
              currentVariants[vi].scene_images[si].public_url = animData.public_image_url || "";
              currentVariants[vi].scene_images[si].clip_status = "animating";
              animationTasks.push({ vi, si, taskId: animData.taskId });
            }
          } catch (e: any) {
            currentVariants[vi].scene_images[si].clip_status = "failed";
          }
        }
        currentVariants[vi] = { ...currentVariants[vi], status: "animating" };
        setVariants([...currentVariants]);
      }

      // --- Launch voice + animation polling in parallel ---
      const voicePromises = currentVariants.map((v, i) => {
        if (v.status === "failed") return Promise.resolve(null);
        return generateVoice(v.script_text, formData.language, formData.accent, i);
      });

      const animationPromise = (async () => {
        if (animationTasks.length === 0) return [];
        setStatusMessage(`Esperando ${animationTasks.length} clips de animación…`);
        const pollPromises = animationTasks.map(async (task) => {
          const clipUrl = await pollClipTask(task.taskId);
          return { ...task, clipUrl };
        });
        return Promise.all(pollPromises);
      })();

      setPipelineStep(STEP_VOICE);

      const [pollResults, voiceResults] = await Promise.all([animationPromise, Promise.all(voicePromises)]);

      // Apply animation results
      for (const result of pollResults) {
        const scene = currentVariants[result.vi].scene_images[result.si];
        if (result.clipUrl) {
          scene.clip_url = result.clipUrl;
          scene.clip_status = "completed";
        } else {
          scene.clip_status = "failed";
        }
      }

      // Organize clips
      for (let vi = 0; vi < currentVariants.length; vi++) {
        const scenes = currentVariants[vi].scene_images;
        const completedClips = scenes.filter(s => s.clip_status === "completed").map(s => s.clip_url);
        currentVariants[vi].clip_urls = completedClips;
        if (completedClips.length > 0) {
          currentVariants[vi].raw_video_url = completedClips[0];
          currentVariants[vi].status = "clips_ready";
        }
      }
      setVariants([...currentVariants]);

      // Apply voice results
      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status === "failed") continue;
        const voiceUrl = voiceResults[i];
        if (voiceUrl) {
          currentVariants[i] = { ...currentVariants[i], voice_audio_url: voiceUrl };
        }
      }

      // === MERGE: Finalize ===
      setPipelineStep(STEP_MERGE);
      setStatusMessage("Finalizando videos…");

      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status !== "failed") {
          // The first clip serves as the primary video; voice_audio_url syncs in player
          currentVariants[i] = {
            ...currentVariants[i],
            status: "completed",
            final_merged_url: currentVariants[i].clip_urls?.[0] || "",
          };
        }
      }
      setVariants([...currentVariants]);

      // Update DB
      if (batchId) {
        await supabase.from("bof_video_batches").update({ status: "completed" }).eq("id", batchId);
        for (const v of currentVariants) {
          await supabase.from("bof_video_variants").update({
            status: v.status,
            raw_video_url: v.raw_video_url,
            voice_audio_url: v.voice_audio_url,
            final_video_url: v.final_merged_url,
          }).eq("id", v.id);
        }
      }

      setStep("results");
      toast.success(`${currentVariants.filter(v => v.status === "completed").length} videos BOF generados`);
    } catch (e: any) {
      console.error("BOF pipeline phase 2 error:", e);
      toast.error(e.message || "Error en fase de animación");
    } finally {
      setIsLoading(false);
    }
  }, [variants, batchId, pollClipTask, generateVoice, buildAnimationPrompt]);

  const handleReset = useCallback(() => {
    setStep("input");
    setVariants([]);
    setBatchId(null);
    setIsLoading(false);
    setPipelineStep(0);
    setStatusMessage("");
    setRegeneratingScenes(new Set());
    formDataRef.current = null;
    productImageUrlRef.current = "";
  }, []);

  return {
    step, pipelineStep, statusMessage, isLoading, variants,
    productName, batchId, regeneratingScenes,
    handleSubmit, handleApproveScene, handleRegenerateScene,
    handleContinueAfterApproval, handleReset,
  };
}
