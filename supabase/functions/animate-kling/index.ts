import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function uploadBase64ToStorage(base64DataUrl: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URL format");

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = mimeType.split("/")[1] || "png";
  const fileName = `kling-input-${crypto.randomUUID()}.${ext}`;

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("videos")
    .upload(fileName, bytes, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicData } = supabase.storage
    .from("videos")
    .getPublicUrl(fileName);

  return publicData.publicUrl;
}

function extractTaskId(data: Record<string, unknown>): string | null {
  const d = data as any;
  return d?.data?.taskId || d?.taskId || d?.data?.task_id || d?.task_id || null;
}

// ── Fallback model chain for no_avatar mode ──

interface ModelAttempt {
  model: string;
  buildPayload: (imageUrl: string, prompt: string) => Record<string, unknown>;
}

const NO_AVATAR_MODELS: ModelAttempt[] = [
  {
    model: "sora-2-image-to-video",
    buildPayload: (imageUrl, prompt) => ({
      model: "sora-2-image-to-video",
      input: {
        prompt,
        image_urls: [imageUrl],
        aspect_ratio: "portrait",
        n_frames: "10",
        remove_watermark: true,
      },
    }),
  },
  {
    model: "sora-2-pro-image-to-video",
    buildPayload: (imageUrl, prompt) => ({
      model: "sora-2-pro-image-to-video",
      input: {
        prompt,
        image_urls: [imageUrl],
        aspect_ratio: "portrait",
        n_frames: "10",
        size: "standard",
        remove_watermark: true,
      },
    }),
  },
];

const MAX_NO_AVATAR_PROMPT = 1500;

async function tryCreateTask(
  payload: Record<string, unknown>,
  modelName: string,
  apiKey: string,
): Promise<{ taskId: string; model: string } | { error: string }> {
  console.log(`[animate-kling] Attempting model: ${modelName}`);
  console.log(`[animate-kling] Payload keys:`, Object.keys(payload));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      "https://api.kie.ai/api/v1/jobs/createTask",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      30000,
    );
  } catch (e: any) {
    const msg = e?.name === "AbortError"
      ? `Timeout (30s) al conectar con proveedor para modelo ${modelName}`
      : `Error de red con modelo ${modelName}: ${e?.message}`;
    console.error(`[animate-kling] ${msg}`);
    return { error: msg };
  }

  const rawText = await response.text();
  console.log(`[animate-kling] ${modelName} HTTP ${response.status}, body preview: ${rawText.substring(0, 500)}`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { error: `Respuesta no-JSON del proveedor con modelo ${modelName}` };
  }

  if (!response.ok) {
    const msg = (data as any)?.msg || (data as any)?.message || `HTTP ${response.status}`;
    return { error: `${modelName} rechazado: ${msg}` };
  }

  const kieCode = (data as any)?.code;
  if (kieCode !== undefined && kieCode !== 200) {
    const msg = (data as any)?.msg || `código ${kieCode}`;
    return { error: `${modelName} error: ${msg}` };
  }

  const taskId = extractTaskId(data);
  if (!taskId) {
    return { error: `${modelName} no devolvió taskId` };
  }

  console.log(`[animate-kling] ✓ Task created with ${modelName}: ${taskId}`);
  return { taskId, model: modelName };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { image_url, video_url, video_duration, video_mode, motion_prompt } = await req.json();

    console.log("[animate-kling] Incoming request:", JSON.stringify({
      video_mode,
      has_image: !!image_url,
      has_video: !!video_url,
      video_duration,
      prompt_length: motion_prompt?.length || 0,
    }));

    const isNoAvatar = video_mode === "no_avatar";

    // ── Input validation ──
    if (!image_url) {
      return jsonResponse({ error: "image_url es requerida." }, 400);
    }

    // Reject blob URLs
    if (image_url.startsWith("blob:")) {
      return jsonResponse({ error: "image_url no puede ser una blob URL. Sube la imagen primero." }, 400);
    }

    if (!isNoAvatar && !video_url) {
      return jsonResponse({ error: "video_url es requerida para modo avatar." }, 400);
    }

    if (!isNoAvatar && video_url && !isValidHttpUrl(video_url)) {
      return jsonResponse({ error: "video_url debe ser una URL HTTP/HTTPS válida." }, 400);
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return jsonResponse({ error: "KIE_API_KEY no está configurada." }, 500);
    }

    // Convert base64 data URL to public HTTP URL
    if (image_url.startsWith("data:")) {
      console.log("[animate-kling] Converting base64 to storage URL...");
      image_url = await uploadBase64ToStorage(image_url);
      console.log("[animate-kling] Public URL:", image_url);
    }

    // Validate final image URL
    if (!isValidHttpUrl(image_url)) {
      return jsonResponse({ error: "image_url debe ser una URL HTTP/HTTPS pública válida." }, 400);
    }

    if (isNoAvatar) {
      // ── No-avatar mode: try fallback chain ──
      let prompt = motion_prompt || "Smooth, cinematic product showcase with subtle camera movement. Natural lighting, photorealistic. No people, no faces.";

      // Cap prompt length to prevent provider rejection
      if (prompt.length > MAX_NO_AVATAR_PROMPT) {
        console.log(`[animate-kling] Truncating prompt from ${prompt.length} to ${MAX_NO_AVATAR_PROMPT} chars`);
        prompt = prompt.substring(0, MAX_NO_AVATAR_PROMPT);
      }

      const errors: string[] = [];
      let fallbackUsed = false;

      for (let i = 0; i < NO_AVATAR_MODELS.length; i++) {
        const attempt = NO_AVATAR_MODELS[i];
        const payload = attempt.buildPayload(image_url, prompt);
        const result = await tryCreateTask(payload, attempt.model, KIE_API_KEY);

        if ("taskId" in result) {
          return jsonResponse({
            taskId: result.taskId,
            model: result.model,
            fallbackUsed: i > 0,
          });
        }

        errors.push(result.error);
        fallbackUsed = true;
        console.warn(`[animate-kling] Model ${attempt.model} failed: ${result.error}. Trying next...`);
      }

      // All models failed
      const combinedError = `Todos los modelos fallaron: ${errors.join(" | ")}`;
      console.error(`[animate-kling] ${combinedError}`);
      return jsonResponse({ error: combinedError, fallbackUsed }, 422);

    } else {
      // ── Kling Motion Control (avatar mode) ──
      if (video_duration && video_duration > 30) {
        return jsonResponse({
          error: "El video excede 30 segundos. Kling solo acepta videos de 3 a 30 segundos.",
        }, 422);
      }

      const videoExt = video_url.split("?")[0].split(".").pop()?.toLowerCase();
      if (videoExt === "webm") {
        return jsonResponse({
          error: "Formato de video no soportado (.webm). Kling requiere formato MP4.",
        }, 422);
      }

      const payload = {
        model: "kling-2.6/motion-control",
        input: {
          prompt: `VISUAL REFERENCE: Strictly use the generated image for the subject's appearance, identity, and background styling.

MOTION REFERENCE: Strictly use the original TikTok video for all movement, pacing, and camera dynamics.

CORE OBJECTIVE: 1:1 Motion transfer. Replicate the exact motion, timing, facial expressions, and gesture rhythm from the reference video with absolute temporal stability.

CRITICAL CONSTRAINTS (TO PREVENT ARTIFACTS):
- STRICT TEMPORAL CONSISTENCY: Maintain absolute structural integrity of the face, body, and background across the entire video.
- NO MORPHING OR MELTING: Zero deformations during movement, camera zooms, or shot transitions.
- ZERO HALLUCINATIONS: Do not invent unnatural physics, extra limbs, or physically impossible movements. Hands and fingers must remain anatomically correct and stable at all times.
- PRODUCT STABILITY: The product held by the subject must remain solid; no warping, bending, or text shifting during movement.

PRESERVE FROM VIDEO:
- Camera distance and natural handheld smartphone movement.
- Gesture rhythm: natural conversational gesturing exactly as the driving video.
- Exact product interaction timing and hand positioning.
- Pacing: quick-paced, direct-to-camera testimonial.

PRESERVE FROM IMAGE:
- Actor identity (must look exactly like the VISUAL REFERENCE image).
- Background details (must exactly match the VISUAL REFERENCE image).

STYLE:
Raw, unretouched UGC TikTok style. Natural lighting. DO NOT add logos, text overlays, or artificial studio effects.`,
          input_urls: [image_url],
          video_urls: [video_url],
          character_orientation: "video",
          mode: "720p",
        },
      };

      console.log("[animate-kling] Sending Kling task:", JSON.stringify({ image_url, video_url }));

      const result = await tryCreateTask(payload, "kling-2.6/motion-control", KIE_API_KEY);

      if ("taskId" in result) {
        return jsonResponse({ taskId: result.taskId, model: result.model, fallbackUsed: false });
      }

      return jsonResponse({ error: result.error }, 422);
    }
  } catch (error: any) {
    console.error("[animate-kling] Unhandled error:", error);
    return jsonResponse({ error: error?.message || "Error desconocido." }, 500);
  }
});
