import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import BrollLabInput from "@/components/broll-lab/BrollLabInput";
import BrollLab2Pipeline from "@/components/broll-lab/BrollLab2Pipeline";
import BrollLabResults from "@/components/broll-lab/BrollLabResults";
import ImageApprovalPanel from "@/components/broll-lab/ImageApprovalPanel";
import type {
  BrollLabInputs,
  BrollLabState,
  TikTokDownloadResult,
  BrollLabAnalysis,
  SceneResult,
  VoiceVariant,
  ProductValidationResult,
} from "@/lib/broll_lab_types";

const INITIAL_STATE: BrollLabState = {
  step: "idle",
  stepMessage: "",
  analysis: null,
  scenes: [],
  approvedScenes: [],
  voiceVariants: [],
  masterVideoUrls: [],
  error: null,
  historyId: null,
};

const NUM_SCENES = 4;
const POLL_INTERVAL = 8000;
const MAX_POLLS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invokeFn<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name} failed`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function invokeRaw(name: string, body: Record<string, unknown>): Promise<ArrayBuffer> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `${name} failed: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

// Polls get-video-task — supports both KIE and fal.ai (prefix-based routing)
async function pollVideoTask(taskId: string): Promise<string> {
  let consecutiveErrors = 0;

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL);
    try {
      const { data, error } = await supabase.functions.invoke("get-video-task", {
        body: { taskId, engine: "sora2" },
      });
      if (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) throw new Error(`Polling falló después de 5 errores consecutivos`);
        continue;
      }
      consecutiveErrors = 0;
      const videoUrl = data?.videoUrl || data?.video_url;
      if (data?.status === "completed" && videoUrl) return videoUrl;
      if (data?.status === "failed" || data?.shouldStopPolling) {
        throw new Error(data?.error || "La animación falló en el proveedor.");
      }
    } catch (e: any) {
      if (e.message) throw e;
    }
  }
  throw new Error("Timeout: la animación tardó demasiado.");
}

// ─── DB persistence helpers ──────────────────────────────────

async function insertHistory(userId: string, inputs: BrollLabInputs, step: string): Promise<string> {
  const tiktokUrls = [inputs.tiktokUrl1, inputs.tiktokUrl2, inputs.tiktokUrl3].filter(Boolean);
  const { data, error } = await supabase
    .from("broll_lab_history" as any)
    .insert({
      user_id: userId,
      product_image_url: inputs.productImageUrl,
      product_url: inputs.productUrl || "",
      tiktok_urls: tiktokUrls,
      pipeline_step: step,
      inputs: inputs,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}

async function updateHistory(id: string, partial: Record<string, unknown>) {
  await supabase
    .from("broll_lab_history" as any)
    .update(partial as any)
    .eq("id", id);
}

// ─── Main page ───────────────────────────────────────────────

export default function BrollLab2Page() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<BrollLabState>(INITIAL_STATE);
  const [running, setRunning] = useState(false);
  const [savedInputs, setSavedInputs] = useState<BrollLabInputs | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const resumeLoaded = useRef(false);

  // ─── Resume from history ────────────────────────────────────
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (!resumeId || !user || resumeLoaded.current) return;
    resumeLoaded.current = true;

    const loadFromDb = async () => {
      const { data, error } = await supabase
        .from("broll_lab_history" as any)
        .select("*")
        .eq("id", resumeId)
        .single();

      if (error || !data) {
        toast.error("No se encontró el proyecto");
        return;
      }

      const d = data as any;
      const inputs = d.inputs as BrollLabInputs;
      setSavedInputs(inputs);

      const restoredState: BrollLabState = {
        step: d.pipeline_step || "idle",
        stepMessage: "Proyecto restaurado desde historial",
        analysis: d.analysis || null,
        scenes: d.scenes || [],
        approvedScenes: (d.scenes || []).map(() => false),
        voiceVariants: d.voice_variants || [],
        masterVideoUrls: d.master_video_urls || [],
        error: null,
        historyId: d.id,
      };

      const pastApproval = ["animating", "stitching", "generating_voices", "merging", "done"].includes(restoredState.step);
      if (pastApproval) {
        restoredState.approvedScenes = restoredState.scenes.map(() => true);
      }

      setState(restoredState);
      setSearchParams({}, { replace: true });
    };

    loadFromDb();
  }, [searchParams, user, setSearchParams]);

  const update = useCallback((partial: Partial<BrollLabState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const persistStep = useCallback(async (historyId: string | null, step: string, extra: Record<string, unknown> = {}) => {
    if (!historyId) return;
    await updateHistory(historyId, { pipeline_step: step, ...extra });
  }, []);

  // ═══════════════════════════════════════════════════
  // Phase 1: Download → Analyze → Generate images → Approval
  // ═══════════════════════════════════════════════════
  const runPhase1 = useCallback(async (inputs: BrollLabInputs) => {
    if (!user) return;
    setRunning(true);
    setSavedInputs(inputs);
    setState({ ...INITIAL_STATE, step: "downloading", stepMessage: "Descargando TikToks de referencia...", historyId: null });

    let historyId: string | null = null;

    try {
      historyId = await insertHistory(user.id, inputs, "downloading");
      update({ historyId });

      // STEP 1: Download TikToks
      const urls = [inputs.tiktokUrl1, inputs.tiktokUrl2, inputs.tiktokUrl3].filter(Boolean);
      const downloads: TikTokDownloadResult[] = [];

      for (const url of urls) {
        update({ stepMessage: `Descargando ${downloads.length + 1}/${urls.length}...` });
        try {
          const result = await invokeFn<TikTokDownloadResult>("download-tiktok", { url });
          downloads.push(result);
        } catch (e: any) {
          console.warn("TikTok download failed for", url, e);
          toast.error(`No se pudo descargar: ${url}`);
        }
      }
      if (downloads.length === 0) throw new Error("No se pudo descargar ningún video de referencia");

      // STEP 2: Analyze references
      update({ step: "analyzing", stepMessage: "Analizando hooks, escenas y patrones ganadores..." });
      await persistStep(historyId, "analyzing");

      const covers = downloads.map((d) => ({ cover_url: d.cover_url, title: d.metadata.title }));
      const analysis = await invokeFn<BrollLabAnalysis>("analyze-broll-lab", {
        covers,
        product_image_url: inputs.productImageUrl,
        product_url: inputs.productUrl,
        language: inputs.language,
        accent: inputs.accent,
        voice_tone: inputs.voiceTone,
        voice_count: inputs.voiceVariantCount,
      });
      update({ analysis });
      await persistStep(historyId, "analyzing", { analysis });

      if (!analysis.scenes || analysis.scenes.length < NUM_SCENES) {
        throw new Error(`El análisis no generó las ${NUM_SCENES} escenas necesarias`);
      }

      // STEP 3: Generate images
      update({ step: "generating_images", stepMessage: `Generando ${NUM_SCENES} escenas ultra-realistas...` });
      await persistStep(historyId, "generating_images");

      const sceneResults: SceneResult[] = analysis.scenes.slice(0, NUM_SCENES).map((s) => ({
        scene_index: s.scene_index,
        image_url: "",
        status: "generating_image" as const,
      }));
      update({ scenes: [...sceneResults] });

      for (let i = 0; i < NUM_SCENES; i++) {
        update({ stepMessage: `Generando escena ${i + 1}/${NUM_SCENES}: ${analysis.scenes[i].label}...` });
        try {
          const imgResult = await invokeFn<{ image_url: string }>("generate-broll-lab-image", {
            image_prompt: analysis.scenes[i].image_prompt,
            scene_index: i,
            product_image_url: inputs.productImageUrl,
            human_actions: analysis.human_actions || "",
            camera_behavior: analysis.camera_behavior || "",
            environment_context: analysis.environment_context || "",
            product_interactions: analysis.product_interactions || "",
          });
          sceneResults[i] = { ...sceneResults[i], image_url: imgResult.image_url, status: "pending" };
          update({ scenes: [...sceneResults] });
        } catch (e: any) {
          sceneResults[i] = { ...sceneResults[i], status: "error", error: e.message };
          update({ scenes: [...sceneResults] });
        }
        if (i < NUM_SCENES - 1) await sleep(2000);
      }

      const successImages = sceneResults.filter((s) => s.image_url);
      if (successImages.length === 0) throw new Error("No se pudo generar ninguna imagen");

      // STEP 3b: Product similarity validation + auto-regen (if product lock ON)
      const productLockEnabled = inputs.productLock !== false;
      const MAX_REGEN_ATTEMPTS = 2;

      if (productLockEnabled && inputs.productImageUrl) {
        update({ stepMessage: "Validando consistencia del producto en escenas generadas..." });

        for (let i = 0; i < sceneResults.length; i++) {
          if (!sceneResults[i].image_url) continue;

          let attempts = 0;
          let validated = false;

          while (!validated && attempts <= MAX_REGEN_ATTEMPTS) {
            try {
              update({ stepMessage: `Validando escena ${i + 1}/${NUM_SCENES}${attempts > 0 ? ` (reintento ${attempts})` : ""}...` });
              const validation = await invokeFn<ProductValidationResult>("validate-product-similarity", {
                product_reference_url: inputs.productImageUrl,
                generated_image_url: sceneResults[i].image_url,
                threshold: 0.85,
              });
              sceneResults[i].validation = validation;

              if (validation.pass || validation.skipped) {
                validated = true;
              } else {
                // Auto-regenerate
                sceneResults[i].regen_count = (sceneResults[i].regen_count || 0) + 1;
                attempts++;
                if (attempts > MAX_REGEN_ATTEMPTS) {
                  console.warn(`Scene ${i} failed validation after ${MAX_REGEN_ATTEMPTS} retries`);
                  break;
                }

                update({ stepMessage: `Escena ${i + 1} no coincide con el producto — regenerando (intento ${attempts})...` });
                const failureContext = validation.failure_reasons.join(". ");
                const retryPrompt = `${analysis.scenes[i].image_prompt}\n\nCRITICAL CORRECTION: Previous attempt failed product validation: ${failureContext}. You MUST match the reference product EXACTLY. Do not change colors, shape, branding, or packaging.`;

                try {
                  const imgResult = await invokeFn<{ image_url: string }>("generate-broll-lab-image", {
                    image_prompt: retryPrompt,
                    scene_index: i,
                    product_image_url: inputs.productImageUrl,
                    human_actions: analysis.human_actions || "",
                    camera_behavior: analysis.camera_behavior || "",
                    environment_context: analysis.environment_context || "",
                    product_interactions: analysis.product_interactions || "",
                  });
                  sceneResults[i].image_url = imgResult.image_url;
                  sceneResults[i].status = "pending";
                  update({ scenes: [...sceneResults] });
                  await sleep(1500);
                } catch (e: any) {
                  console.warn(`Regen failed for scene ${i}:`, e.message);
                  break;
                }
              }
            } catch (e: any) {
              console.warn(`Validation failed for scene ${i}:`, e.message);
              // Don't block on validation errors — mark as skipped
              sceneResults[i].validation = {
                silhouette_score: 1, color_score: 1, branding_score: 1,
                packaging_score: 1, proportion_score: 1, overall_product_match: 1,
                pass: true, failure_reasons: [], skipped: true, skip_reason: e.message,
              };
              validated = true;
            }
          }
          update({ scenes: [...sceneResults] });
        }
      }

      const approvedArr = sceneResults.map(() => false);
      update({
        step: "awaiting_approval",
        stepMessage: "Revisa y aprueba las imágenes antes de continuar.",
        scenes: [...sceneResults],
        approvedScenes: approvedArr,
      });
      await persistStep(historyId, "awaiting_approval", { scenes: sceneResults });
    } catch (e: any) {
      console.error("BRoll Lab 2.0 phase 1 error:", e);
      update({ step: "error", error: e.message, stepMessage: e.message });
      if (historyId) await persistStep(historyId, "error");
      toast.error(e.message || "Error en el pipeline");
    } finally {
      setRunning(false);
    }
  }, [update, user, persistStep]);

  // Approve / Regenerate
  const handleApprove = useCallback((index: number) => {
    setState((prev) => {
      const approved = [...prev.approvedScenes];
      approved[index] = !approved[index];
      return { ...prev, approvedScenes: approved };
    });
  }, []);

  const handleRegenerate = useCallback(async (index: number) => {
    if (!savedInputs || !state.analysis) return;
    setRegeneratingIndex(index);
    try {
      const imgResult = await invokeFn<{ image_url: string }>("generate-broll-lab-image", {
        image_prompt: state.analysis.scenes[index].image_prompt,
        scene_index: index,
        product_image_url: savedInputs.productImageUrl,
        human_actions: state.analysis.human_actions || "",
        camera_behavior: state.analysis.camera_behavior || "",
        environment_context: state.analysis.environment_context || "",
        product_interactions: state.analysis.product_interactions || "",
      });

      // Validate if product lock is on
      let validation: ProductValidationResult | undefined;
      const productLockEnabled = savedInputs.productLock !== false;
      if (productLockEnabled && savedInputs.productImageUrl) {
        try {
          validation = await invokeFn<ProductValidationResult>("validate-product-similarity", {
            product_reference_url: savedInputs.productImageUrl,
            generated_image_url: imgResult.image_url,
            threshold: 0.85,
          });
        } catch (e: any) {
          console.warn("Validation after regen failed:", e.message);
        }
      }

      setState((prev) => {
        const scenes = [...prev.scenes];
        scenes[index] = {
          ...scenes[index],
          image_url: imgResult.image_url,
          status: "pending",
          error: undefined,
          validation,
          regen_count: (scenes[index].regen_count || 0) + 1,
        };
        const approved = [...prev.approvedScenes];
        approved[index] = false;
        return { ...prev, scenes, approvedScenes: approved };
      });

      if (validation && !validation.pass) {
        toast.warning(`Escena ${index + 1} regenerada pero el producto no coincide`);
      } else {
        toast.success(`Escena ${index + 1} regenerada`);
      }
    } catch (e: any) {
      toast.error(`Error regenerando escena ${index + 1}: ${e.message}`);
    } finally {
      setRegeneratingIndex(null);
    }
  }, [savedInputs, state.analysis]);

  // ═══════════════════════════════════════════════════
  // Phase 2: Animate (Sora 2 + fallback) → Voices → Merge
  // ═══════════════════════════════════════════════════
  const runPhase2 = useCallback(async () => {
    if (!savedInputs || !state.analysis) return;
    setRunning(true);

    const sceneResults = [...state.scenes];
    const analysis = state.analysis;
    const inputs = savedInputs;
    const historyId = state.historyId;

    try {
      // STEP 4: Animate with Sora 2 (via animate-bof-scene which has KIE → fal.ai fallback)
      update({ step: "animating", stepMessage: "Animando escenas con Sora 2 (respaldo dual KIE + fal.ai)..." });
      await persistStep(historyId, "animating");

      const successImages = sceneResults.filter((s) => s.image_url);
      const animationTasks: { sceneIdx: number; taskId: string }[] = [];

      for (const scene of successImages) {
        const motionPrompt = analysis.scenes[scene.scene_index]?.motion_prompt ||
          "Subtle handheld camera motion. Slow zoom in with gentle drift. Natural smartphone recording. Duration: approximately 6 seconds.";

        // Enrich prompt with voice script for native Sora narration
        const voiceScript = analysis.voice_scripts?.[0];
        const enrichedPrompt = `${motionPrompt}

SCENE CONTEXT: ${analysis.scenes[scene.scene_index]?.label || `Scene ${scene.scene_index + 1}`}
PRODUCT: ${analysis.product_detected || "product"}
VISUAL STYLE: Ultra-realistic UGC smartphone recording. Natural handheld motion. 9:16 vertical.
Duration: approximately 6 seconds per scene.
No text overlays, no watermarks. Clean video only.`;

        try {
          // Uses animate-bof-scene which has KIE → fal.ai fallback built in
          const animResult = await invokeFn<{ taskId: string; engine: string }>("animate-bof-scene", {
            image_url: scene.image_url,
            motion_prompt: enrichedPrompt,
            scene_index: scene.scene_index,
          });
          scene.video_task_id = animResult.taskId;
          scene.status = "polling";
          animationTasks.push({ sceneIdx: scene.scene_index, taskId: animResult.taskId });
          console.log(`[BRoll Lab 2.0] Scene ${scene.scene_index} queued via ${animResult.engine}`);
        } catch (e: any) {
          scene.status = "error";
          scene.error = e.message;
        }
      }
      update({ scenes: [...sceneResults] });

      // Poll all animation tasks in parallel
      if (animationTasks.length > 0) {
        update({ stepMessage: `Esperando ${animationTasks.length} clips de animación Sora 2...` });
        const videoUrls: string[] = [];

        const pollResults = await Promise.all(
          animationTasks.map(async (task) => {
            try {
              const videoUrl = await pollVideoTask(task.taskId);
              return { sceneIdx: task.sceneIdx, videoUrl, error: null };
            } catch (e: any) {
              return { sceneIdx: task.sceneIdx, videoUrl: null, error: e.message };
            }
          })
        );

        // Apply results
        for (const result of pollResults) {
          const scene = sceneResults.find(s => s.scene_index === result.sceneIdx);
          if (!scene) continue;
          if (result.videoUrl) {
            scene.video_url = result.videoUrl;
            scene.status = "done";
            videoUrls.push(result.videoUrl);
          } else {
            scene.status = "error";
            scene.error = result.error || "Animation failed";
          }
        }
        update({ scenes: [...sceneResults] });

        // Retry failed scenes
        const failedScenes = pollResults.filter(r => !r.videoUrl);
        if (failedScenes.length > 0) {
          update({ stepMessage: `Reintentando ${failedScenes.length} escenas fallidas...` });

          for (const failed of failedScenes) {
            const scene = sceneResults.find(s => s.scene_index === failed.sceneIdx);
            if (!scene?.image_url) continue;

            try {
              const motionPrompt = analysis.scenes[failed.sceneIdx]?.motion_prompt || "Natural handheld camera motion.";
              const retryResult = await invokeFn<{ taskId: string }>("animate-bof-scene", {
                image_url: scene.image_url,
                motion_prompt: motionPrompt,
                scene_index: failed.sceneIdx,
              });

              const retryUrl = await pollVideoTask(retryResult.taskId);
              if (retryUrl) {
                scene.video_url = retryUrl;
                scene.status = "done";
                videoUrls.push(retryUrl);
              }
            } catch { /* skip retry failures */ }
          }
          update({ scenes: [...sceneResults] });
        }

        if (videoUrls.length === 0) throw new Error("No se pudo animar ninguna escena");

        // STEP 5: Master video ready
        update({ step: "stitching", stepMessage: `Video master listo (${videoUrls.length} clips Sora 2)`, masterVideoUrls: videoUrls });
        await persistStep(historyId, "stitching", { master_video_urls: videoUrls, scenes: sceneResults });

        // STEP 6: Generate voices
        update({ step: "generating_voices", stepMessage: "Generando variantes de voz..." });
        await persistStep(historyId, "generating_voices");

        const voiceVariants: VoiceVariant[] = (analysis.voice_scripts || []).map((script) => ({
          variant_index: script.variant_index,
          script,
          status: "generating_voice" as const,
        }));
        update({ voiceVariants: [...voiceVariants] });

        for (let i = 0; i < voiceVariants.length; i++) {
          update({ stepMessage: `Generando voz ${i + 1}/${voiceVariants.length}...` });
          try {
            const audioBuffer = await invokeRaw("generate-bof-voice", {
              text: voiceVariants[i].script.full_text,
              language: inputs.language,
              accent: inputs.accent,
            });

            const bytes = new Uint8Array(audioBuffer);
            let binary = "";
            for (let b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
            const base64Audio = btoa(binary);

            const mergeResult = await invokeFn<{ audio_url?: string; video_url?: string }>("merge-broll-audio", {
              video_url: videoUrls[0],
              audio_base64: base64Audio,
              variant_id: `broll2_v${i}_${Date.now()}`,
            });

            voiceVariants[i].audio_url = mergeResult.audio_url;
            voiceVariants[i].final_video_url = mergeResult.video_url || videoUrls[0];
            voiceVariants[i].status = "done";
          } catch (e: any) {
            voiceVariants[i].status = "error";
            voiceVariants[i].error = e.message;
          }
          update({ voiceVariants: [...voiceVariants] });
          if (i < voiceVariants.length - 1) await sleep(1000);
        }

        // STEP 7: Done
        const doneCount = voiceVariants.filter(v => v.status === "done").length;
        update({
          step: "done",
          stepMessage: `¡Listo! ${videoUrls.length} clips Sora 2 + ${doneCount} variantes de voz.`,
          voiceVariants: [...voiceVariants],
        });
        await persistStep(historyId, "done", {
          voice_variants: voiceVariants,
          variant_count: doneCount,
          master_video_urls: videoUrls,
          scenes: sceneResults,
        });
        toast.success("Pipeline 2.0 completado — Videos Sora 2 listos");
      }
    } catch (e: any) {
      console.error("BRoll Lab 2.0 phase 2 error:", e);
      update({ step: "error", error: e.message, stepMessage: e.message });
      if (historyId) await persistStep(historyId, "error");
      toast.error(e.message || "Error en el pipeline");
    } finally {
      setRunning(false);
    }
  }, [savedInputs, state.analysis, state.scenes, state.historyId, update, persistStep]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">B-Roll Lab 2.0</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mismo flujo del Lab original pero con <span className="font-medium text-foreground">Sora 2</span> para animaciones hiperrealistas + respaldo dual (KIE → fal.ai).
        </p>
      </div>

      {state.step === "idle" && <BrollLabInput onSubmit={runPhase1} loading={running} />}

      {state.step !== "idle" && (
        <>
          <BrollLab2Pipeline currentStep={state.step} stepMessage={state.stepMessage} />

          {state.step === "awaiting_approval" && (
            <ImageApprovalPanel
              scenes={state.scenes}
              approvedScenes={state.approvedScenes}
              analysis={state.analysis}
              onApprove={handleApprove}
              onRegenerate={handleRegenerate}
              onContinue={runPhase2}
              regeneratingIndex={regeneratingIndex}
              productLock={savedInputs?.productLock !== false}
              productImageUrl={savedInputs?.productImageUrl}
            />
          )}

          <BrollLabResults state={state} />

          {(state.step === "done" || state.step === "error") && (
            <button
              onClick={() => setState(INITIAL_STATE)}
              className="text-sm text-primary hover:underline"
            >
              ← Nuevo proyecto
            </button>
          )}
        </>
      )}
    </div>
  );
}
