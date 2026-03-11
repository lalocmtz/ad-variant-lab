import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrollLabInput from "@/components/broll-lab/BrollLabInput";
import BrollLabPipeline from "@/components/broll-lab/BrollLabPipeline";
import BrollLabResults from "@/components/broll-lab/BrollLabResults";
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
  voiceVariants: [],
  masterVideoUrls: [],
  error: null,
};

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

/** Poll video task via get-video-task with timeout */
async function pollVideoTask(taskId: string, maxAttempts = 90, intervalMs = 5000): Promise<string> {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const { data, error } = await supabase.functions.invoke("get-video-task", {
        body: { taskId, engine: "sora2" },
      });

      // Network/invoke-level error
      if (error) {
        consecutiveErrors++;
        console.warn(`Poll attempt ${i + 1} network error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);
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

      // Still processing — continue
    } catch (e: any) {
      if (e.message) throw e;
    }
  }
  throw new Error("Timeout: la animación tardó demasiado. Intenta de nuevo.");
}

export default function BrollLabPage() {
  const [state, setState] = useState<BrollLabState>(INITIAL_STATE);
  const [running, setRunning] = useState(false);

  const update = useCallback((partial: Partial<BrollLabState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const runPipeline = useCallback(async (inputs: BrollLabInputs) => {
    setRunning(true);
    setState({ ...INITIAL_STATE, step: "downloading", stepMessage: "Descargando TikToks de referencia..." });

    try {
      // ============ STEP 1: Download TikToks ============
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

      // ============ STEP 2: Analyze references ============
      update({ step: "analyzing", stepMessage: "Analizando hooks, escenas y patrones ganadores..." });

      const covers = downloads.map((d) => ({
        cover_url: d.cover_url,
        title: d.metadata.title,
      }));

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

      if (!analysis.scenes || analysis.scenes.length < 3) throw new Error("El análisis no generó las 3 escenas necesarias");

      // ============ STEP 3: Generate 3 images ============
      update({ step: "generating_images", stepMessage: "Generando 3 escenas ultra-realistas..." });

      const sceneResults: SceneResult[] = analysis.scenes.slice(0, 3).map((s) => ({
        scene_index: s.scene_index,
        image_url: "",
        status: "generating_image" as const,
      }));
      update({ scenes: [...sceneResults] });

      for (let i = 0; i < 3; i++) {
        update({ stepMessage: `Generando escena ${i + 1}/3: ${analysis.scenes[i].label}...` });
        try {
          const imgResult = await invokeFn<{ image_url: string }>("generate-broll-lab-image", {
            image_prompt: analysis.scenes[i].image_prompt,
            scene_index: i,
            product_image_url: inputs.productImageUrl,
          });
          sceneResults[i] = { ...sceneResults[i], image_url: imgResult.image_url, status: "animating" };
          update({ scenes: [...sceneResults] });
        } catch (e: any) {
          sceneResults[i] = { ...sceneResults[i], status: "error", error: e.message };
          update({ scenes: [...sceneResults] });
          console.error(`Image gen failed for scene ${i}:`, e);
        }
        if (i < 2) await sleep(2000);
      }

      const successImages = sceneResults.filter((s) => s.image_url);
      if (successImages.length === 0) throw new Error("No se pudo generar ninguna imagen");

      // ============ STEP 4: Animate 3 scenes with Sora 2 ============
      update({ step: "animating", stepMessage: "Animando escenas con Sora 2..." });

      for (const scene of successImages) {
        const motionPrompt = analysis.scenes[scene.scene_index]?.motion_prompt ||
          "Subtle handheld camera motion. Slow zoom in with gentle drift. Natural smartphone recording. Duration: approximately 4 seconds.";
        try {
          const animResult = await invokeFn<{ taskId: string }>("animate-bof-scene", {
            image_url: scene.image_url,
            motion_prompt: motionPrompt,
            scene_index: scene.scene_index,
          });
          scene.video_task_id = animResult.taskId;
          scene.status = "polling";
        } catch (e: any) {
          scene.status = "error";
          scene.error = e.message;
          console.error(`Animation start failed for scene ${scene.scene_index}:`, e);
        }
      }
      update({ scenes: [...sceneResults] });

      // Poll all animation tasks
      const pollingScenes = sceneResults.filter((s) => s.status === "polling" && s.video_task_id);
      const videoUrls: string[] = [];

      for (const scene of pollingScenes) {
        update({ stepMessage: `Esperando animación escena ${scene.scene_index + 1}/3...` });
        try {
          const videoUrl = await pollVideoTask(scene.video_task_id!, 90, 5000);
          scene.video_url = videoUrl;
          scene.status = "done";
          videoUrls.push(videoUrl);
        } catch (e: any) {
          scene.status = "error";
          scene.error = e.message;
          console.error(`Animation poll failed for scene ${scene.scene_index}:`, e);
        }
        update({ scenes: [...sceneResults] });
      }

      if (videoUrls.length === 0) throw new Error("No se pudo animar ninguna escena");

      // ============ STEP 5: Master video ready ============
      update({ step: "stitching", stepMessage: "Video master listo — preparando variantes de voz...", masterVideoUrls: videoUrls });

      // ============ STEP 6: Generate 5 voices ============
      update({ step: "generating_voices", stepMessage: "Generando variantes de voz..." });

      const voiceVariants: VoiceVariant[] = (analysis.voice_scripts || []).map((script) => ({
        variant_index: script.variant_index,
        script,
        status: "generating_voice" as const,
      }));
      update({ voiceVariants: [...voiceVariants] });

      // Generate voice + merge for each variant
      for (let i = 0; i < voiceVariants.length; i++) {
        update({ stepMessage: `Generando voz ${i + 1}/${voiceVariants.length}...` });
        try {
          const audioBuffer = await invokeRaw("generate-bof-voice", {
            text: voiceVariants[i].script.full_text,
            language: inputs.language,
            accent: inputs.accent,
          });

          // Convert to base64
          const bytes = new Uint8Array(audioBuffer);
          let binary = "";
          for (let b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b]);
          const base64Audio = btoa(binary);

          // Upload audio and get URL (uses first master video as reference)
          const mergeResult = await invokeFn<{ audio_url: string }>("merge-broll-audio", {
            video_url: videoUrls[0],
            audio_base64: base64Audio,
            variant_id: `broll_lab_v${i}_${Date.now()}`,
          });

          voiceVariants[i].audio_url = mergeResult.audio_url;
          voiceVariants[i].status = "done";
        } catch (e: any) {
          voiceVariants[i].status = "error";
          voiceVariants[i].error = e.message;
          console.error(`Voice ${i} failed:`, e);
        }
        update({ voiceVariants: [...voiceVariants] });
        if (i < voiceVariants.length - 1) await sleep(1000);
      }

      // ============ STEP 7: Done ============
      update({
        step: "done",
        stepMessage: "¡Listo! 1 video master + 5 variantes de voz disponibles.",
        voiceVariants: [...voiceVariants],
      });
      toast.success("Pipeline completado — Variantes listas para descargar");
    } catch (e: any) {
      console.error("Broll Lab pipeline error:", e);
      update({ step: "error", error: e.message, stepMessage: e.message });
      toast.error(e.message || "Error en el pipeline");
    } finally {
      setRunning(false);
    }
  }, [update]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">B-Roll Variants Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza TikToks ganadores → genera 3 escenas nuevas → anima → crea 5 variantes de voz. Todo desde cero con máximo realismo.
        </p>
      </div>

      {state.step === "idle" && <BrollLabInput onSubmit={runPipeline} loading={running} />}

      {state.step !== "idle" && (
        <>
          <BrollLabPipeline currentStep={state.step} stepMessage={state.stepMessage} />
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
