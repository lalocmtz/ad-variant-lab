import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import BrollLabInput from "@/components/broll-lab/BrollLabInput";
import BrollLabPipeline from "@/components/broll-lab/BrollLabPipeline";
import BrollLabResults from "@/components/broll-lab/BrollLabResults";
import ImageApprovalPanel from "@/components/broll-lab/ImageApprovalPanel";
import type {
  BrollLabInputs,
  BrollLabState,
  TikTokDownloadResult,
  BrollLabAnalysis,
  SceneResult,
  VoiceVariant,
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

async function pollVideoTask(taskId: string, maxAttempts = 120, intervalMs = 5000): Promise<string> {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const { data, error } = await supabase.functions.invoke("get-video-task", {
        body: { taskId, engine: "grok-imagine" },
      });

      if (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Polling falló después de ${MAX_CONSECUTIVE_ERRORS} errores consecutivos: ${error.message}`);
        }
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
  throw new Error("Timeout: la animación tardó demasiado. Intenta de nuevo.");
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

export default function BrollLabPage() {
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

      // If step is past approval or done, mark scenes as approved
      const pastApproval = ["animating", "stitching", "generating_voices", "merging", "done"].includes(restoredState.step);
      if (pastApproval) {
        restoredState.approvedScenes = restoredState.scenes.map(() => true);
      }

      setState(restoredState);

      // Clean up URL param
      setSearchParams({}, { replace: true });
    };

    loadFromDb();
  }, [searchParams, user, setSearchParams]);

  const update = useCallback((partial: Partial<BrollLabState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // Persist step changes to DB
  const persistStep = useCallback(async (historyId: string | null, step: string, extra: Record<string, unknown> = {}) => {
    if (!historyId) return;
    await updateHistory(historyId, { pipeline_step: step, ...extra });
  }, []);

  // Phase 1: Download → Analyze → Generate images → Stop for approval
  const runPhase1 = useCallback(async (inputs: BrollLabInputs) => {
    if (!user) return;
    setRunning(true);
    setSavedInputs(inputs);
    setState({ ...INITIAL_STATE, step: "downloading", stepMessage: "Descargando TikToks de referencia...", historyId: null });

    let historyId: string | null = null;

    try {
      // Insert DB row immediately
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

      // STOP — await approval
      const approvedArr = sceneResults.map(() => false);
      update({
        step: "awaiting_approval",
        stepMessage: "Revisa y aprueba las imágenes antes de continuar.",
        scenes: [...sceneResults],
        approvedScenes: approvedArr,
      });
      await persistStep(historyId, "awaiting_approval", { scenes: sceneResults });
    } catch (e: any) {
      console.error("Broll Lab pipeline phase 1 error:", e);
      update({ step: "error", error: e.message, stepMessage: e.message });
      if (historyId) await persistStep(historyId, "error");
      toast.error(e.message || "Error en el pipeline");
    } finally {
      setRunning(false);
    }
  }, [update, user, persistStep]);

  // Approve a scene
  const handleApprove = useCallback((index: number) => {
    setState((prev) => {
      const approved = [...prev.approvedScenes];
      approved[index] = !approved[index];
      return { ...prev, approvedScenes: approved };
    });
  }, []);

  // Regenerate a single scene image
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

      setState((prev) => {
        const scenes = [...prev.scenes];
        scenes[index] = { ...scenes[index], image_url: imgResult.image_url, status: "pending", error: undefined };
        const approved = [...prev.approvedScenes];
        approved[index] = false;
        return { ...prev, scenes, approvedScenes: approved };
      });
      toast.success(`Escena ${index + 1} regenerada`);
    } catch (e: any) {
      toast.error(`Error regenerando escena ${index + 1}: ${e.message}`);
    } finally {
      setRegeneratingIndex(null);
    }
  }, [savedInputs, state.analysis]);

  // Phase 2: Animate → Voices → Merge → Done
  const runPhase2 = useCallback(async () => {
    if (!savedInputs || !state.analysis) return;
    setRunning(true);

    const sceneResults = [...state.scenes];
    const analysis = state.analysis;
    const inputs = savedInputs;
    const historyId = state.historyId;

    try {
      // STEP 4: Animate with Grok Imagine
      update({ step: "animating", stepMessage: "Animando escenas con Grok Imagine..." });
      await persistStep(historyId, "animating");

      const successImages = sceneResults.filter((s) => s.image_url);
      for (const scene of successImages) {
        const motionPrompt = analysis.scenes[scene.scene_index]?.motion_prompt ||
          "Subtle handheld camera motion. Slow zoom in with gentle drift. Natural smartphone recording.";
        try {
          const animResult = await invokeFn<{ taskId: string }>("animate-broll-lab-scene", {
            image_url: scene.image_url,
            motion_prompt: motionPrompt,
            scene_index: scene.scene_index,
          });
          scene.video_task_id = animResult.taskId;
          scene.status = "polling";
        } catch (e: any) {
          scene.status = "error";
          scene.error = e.message;
        }
      }
      update({ scenes: [...sceneResults] });

      // Poll all animation tasks
      const pollingScenes = sceneResults.filter((s) => s.status === "polling" && s.video_task_id);
      const videoUrls: string[] = [];

      for (const scene of pollingScenes) {
        update({ stepMessage: `Esperando animación escena ${scene.scene_index + 1}/${NUM_SCENES}...` });
        try {
          const videoUrl = await pollVideoTask(scene.video_task_id!, 120, 5000);
          scene.video_url = videoUrl;
          scene.status = "done";
          videoUrls.push(videoUrl);
        } catch (e: any) {
          scene.status = "error";
          scene.error = e.message;
        }
        update({ scenes: [...sceneResults] });
      }

      if (videoUrls.length === 0) throw new Error("No se pudo animar ninguna escena");

      // STEP 5: Master video ready
      update({ step: "stitching", stepMessage: `Video master listo (${videoUrls.length} clips)`, masterVideoUrls: videoUrls });
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
            variant_id: `broll_lab_v${i}_${Date.now()}`,
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
        stepMessage: `¡Listo! ${videoUrls.length} clips master + ${doneCount} variantes de voz.`,
        voiceVariants: [...voiceVariants],
      });
      await persistStep(historyId, "done", {
        voice_variants: voiceVariants,
        variant_count: doneCount,
        master_video_urls: videoUrls,
        scenes: sceneResults,
      });
      toast.success("Pipeline completado — Variantes listas para descargar");
    } catch (e: any) {
      console.error("Broll Lab pipeline phase 2 error:", e);
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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">B-Roll Variants Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza TikToks ganadores → genera 4 escenas → aprueba → anima con Grok Imagine → crea variantes de voz.
        </p>
      </div>

      {state.step === "idle" && <BrollLabInput onSubmit={runPhase1} loading={running} />}

      {state.step !== "idle" && (
        <>
          <BrollLabPipeline currentStep={state.step} stepMessage={state.stepMessage} />

          {state.step === "awaiting_approval" && (
            <ImageApprovalPanel
              scenes={state.scenes}
              approvedScenes={state.approvedScenes}
              analysis={state.analysis}
              onApprove={handleApprove}
              onRegenerate={handleRegenerate}
              onContinue={runPhase2}
              regeneratingIndex={regeneratingIndex}
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
