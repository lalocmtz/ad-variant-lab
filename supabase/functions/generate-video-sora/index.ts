import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Canonical Video Spec ──
// Every video generated must target these constraints.
// Individual engines may have different max durations — that's documented per engine.

interface EngineSpec {
  label: string;
  kieModelId: string;
  maxDurationSeconds: number;
  aspectRatio: "9:16";
  audioSupported: false; // No engine reliably produces speech audio
  stable: boolean; // Whether this engine is production-ready
  buildInput: (prompt: string, imageUrl: string) => Record<string, unknown>;
}

const ENGINES: Record<string, EngineSpec> = {
  kling: {
    label: "Kling 2.6",
    kieModelId: "kling-2.6/image-to-video",
    maxDurationSeconds: 5,
    aspectRatio: "9:16",
    audioSupported: false,
    stable: true,
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      duration: "5",
      sound: false,
    }),
  },
  hailuo: {
    label: "Hailuo 2.3 Pro",
    kieModelId: "hailuo/2-3-image-to-video-pro",
    maxDurationSeconds: 6,
    aspectRatio: "9:16",
    audioSupported: false,
    stable: true,
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_url: imageUrl,
      duration: "6",
      resolution: "768P",
    }),
  },
  wan: {
    label: "Wan 2.6",
    kieModelId: "wan/2-6-image-to-video",
    maxDurationSeconds: 5,
    aspectRatio: "9:16",
    audioSupported: false,
    stable: true,
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      duration: "5",
      resolution: "1080p",
    }),
  },
  sora2: {
    label: "Sora 2",
    kieModelId: "sora-2-image-to-video",
    maxDurationSeconds: 10,
    aspectRatio: "9:16",
    audioSupported: false,
    stable: false, // Frequently returns internal errors
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      aspect_ratio: "portrait",
      n_frames: "10",
      remove_watermark: true,
    }),
  },
};

// Auto fallback chain — only used when user explicitly selects "auto"
const AUTO_CHAIN: string[] = ["kling", "hailuo", "wan"];

// ── Helpers ──

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

function extractTaskId(data: Record<string, unknown>): string | null {
  const d = data as any;
  return d?.data?.taskId || d?.taskId || d?.data?.task_id || d?.task_id || null;
}

// ── Prompt builder — duration-aware, no false audio promises ──

const MAX_PROMPT_CHARS = 2000;

function buildVideoPrompt(rawPrompt: string, engine: EngineSpec, language: string, accent: string): string {
  const langLabel = language === "es-MX" ? "español mexicano" : language === "es-CO" ? "español colombiano" : language === "es-ES" ? "español de España" : language === "en-US" ? "English (US)" : language;
  const isSpanish = language.startsWith("es");

  const suffix = `

MANDATORY VIDEO RULES:
- Use the attached image as the actor identity and first-frame reference.
- Create a natural handheld 9:16 vertical UGC-style video.
- Duration: exactly ${engine.maxDurationSeconds} seconds.
- No subtitles, captions, text overlays, stickers, or motion graphics.
- No spoken audio — this is a SILENT video clip.
- Clean native smartphone recording style.
- Smooth natural motion, slight handheld movement.

LANGUAGE CONTEXT: Visual text/signs should be in ${langLabel}${isSpanish ? `, accent context: ${accent}` : ""}.
NOTE: Audio/voiceover will be added separately in post-production.`;

  const maxBase = MAX_PROMPT_CHARS - suffix.length;
  let sanitized = rawPrompt.trim();
  if (sanitized.length > maxBase) {
    console.log(`[generate-video] Truncating prompt from ${sanitized.length} to ${maxBase} chars`);
    sanitized = sanitized.substring(0, maxBase);
  }

  return sanitized + suffix;
}

// ── Response helpers ──

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(stage: string, engine: string, error: string, retryable: boolean, httpStatus = 400) {
  return jsonResponse({ ok: false, stage, engine, error, retryable }, httpStatus);
}

function successResponse(taskId: string, engineKey: string, engine: EngineSpec, variantId: string, fallbackUsed: boolean) {
  return jsonResponse({
    ok: true,
    taskId,
    variantId,
    status: "queued",
    engine: engineKey,
    modelLabel: engine.label,
    model: engine.kieModelId,
    fallbackUsed,
    spec: {
      aspect_ratio: engine.aspectRatio,
      duration_seconds: engine.maxDurationSeconds,
      audio_expected: engine.audioSupported,
    },
  });
}

// ── Validation ──

function validateRequest(engineKey: string): { engine: EngineSpec } | { error: string } {
  const engine = ENGINES[engineKey];
  if (!engine) {
    return { error: `Motor desconocido: "${engineKey}". Motores disponibles: ${Object.keys(ENGINES).join(", ")}` };
  }
  return { engine };
}

// ── Attempt a single engine ──

async function attemptCreateTask(
  engineKey: string,
  engine: EngineSpec,
  prompt: string,
  imageUrl: string,
  apiKey: string,
): Promise<{ taskId: string } | { error: string; retryable: boolean }> {
  const input = engine.buildInput(prompt, imageUrl);
  const requestBody = { model: engine.kieModelId, input };

  console.log(`[generate-video] → ${engine.label} (${engine.kieModelId}), prompt: ${prompt.length} chars, duration: ${engine.maxDurationSeconds}s`);
  console.log(`[generate-video] Payload preview:`, JSON.stringify(requestBody).substring(0, 600));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      "https://api.kie.ai/api/v1/jobs/createTask",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      30000,
    );
  } catch (e: any) {
    const msg = e?.name === "AbortError"
      ? `Timeout (30s) conectando con ${engine.label}`
      : `Error de red (${engine.label}): ${e?.message}`;
    console.error(`[generate-video] ${msg}`);
    return { error: msg, retryable: true };
  }

  const responseText = await response.text();
  console.log(`[generate-video] ${engine.label} HTTP ${response.status}, body: ${responseText.substring(0, 500)}`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { error: `Respuesta no-JSON de ${engine.label}`, retryable: false };
  }

  if (!response.ok) {
    const statusErrors: Record<number, string> = {
      401: "Autenticación con el proveedor falló.",
      402: "Sin créditos suficientes.",
      422: "Parámetros inválidos para este motor.",
      429: "Límite de solicitudes. Intenta en unos minutos.",
    };
    const friendly = statusErrors[response.status] || `${engine.label} rechazó la solicitud (HTTP ${response.status})`;
    return { error: `${engine.label}: ${friendly}`, retryable: response.status === 429 || response.status >= 500 };
  }

  const kieCode = (data as any).code;
  if (kieCode !== undefined && kieCode !== 200) {
    const msg = (data as any).msg || `código ${kieCode}`;
    console.error(`[generate-video] ${engine.label} app error: ${kieCode} ${msg}`);
    return { error: `${engine.label}: ${msg}`, retryable: false };
  }

  const taskId = extractTaskId(data);
  if (!taskId) {
    console.error(`[generate-video] No taskId from ${engine.label}:`, JSON.stringify(data).substring(0, 500));
    return { error: `${engine.label} no devolvió taskId.`, retryable: false };
  }

  return { taskId };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantId, imageUrl, promptText, language, accent, model } = await req.json();

    console.log("[generate-video] Request:", JSON.stringify({
      variantId,
      imageUrlPreview: imageUrl?.substring(0, 80),
      promptLength: promptText?.length,
      language,
      accent,
      model,
    }));

    // ── Input validation ──
    if (!variantId) return errorResponse("validation", "", "variantId es requerido.", false, 400);
    if (!imageUrl) return errorResponse("validation", "", "La imagen de la variante es requerida.", false, 400);
    if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:"))
      return errorResponse("validation", "", "La imagen debe ser una URL pública (no base64/blob).", false, 400);
    if (!isValidHttpUrl(imageUrl))
      return errorResponse("validation", "", "imageUrl no es una URL HTTP/HTTPS válida.", false, 400);
    if (!promptText || promptText.trim().length < 20)
      return errorResponse("validation", "", "El prompt es requerido (mínimo 20 caracteres).", false, 400);

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return errorResponse("config", "", "KIE_API_KEY no está configurada.", false, 500);

    const videoLanguage = language || "es-MX";
    const videoAccent = accent || "mexicano";

    // ── Determine engine(s) to try ──
    const isAutoMode = !model || model === "auto";
    const enginesToTry: string[] = isAutoMode ? [...AUTO_CHAIN] : [model];

    // Validate all engines before attempting
    for (const key of enginesToTry) {
      const validation = validateRequest(key);
      if ("error" in validation) {
        return errorResponse("validation", key, validation.error, false, 400);
      }
    }

    const errors: string[] = [];

    for (let i = 0; i < enginesToTry.length; i++) {
      const engineKey = enginesToTry[i];
      const engine = ENGINES[engineKey];

      // Build duration-accurate prompt for THIS engine
      const finalPrompt = buildVideoPrompt(promptText, engine, videoLanguage, videoAccent);
      console.log(`[generate-video] Final prompt for ${engine.label}: ${finalPrompt.length} chars`);

      const result = await attemptCreateTask(engineKey, engine, finalPrompt, imageUrl, KIE_API_KEY);

      if ("taskId" in result) {
        if (i > 0) {
          console.log(`[generate-video] ⚠ Fallback used: original ${enginesToTry[0]} → ${engineKey}`);
        }
        return successResponse(result.taskId, engineKey, engine, variantId, i > 0);
      }

      errors.push(result.error);
      console.warn(`[generate-video] ${engineKey} failed: ${result.error}. ${i < enginesToTry.length - 1 ? "Trying next in chain..." : "No more engines."}`);

      // In explicit mode (not auto), do NOT try other engines
      if (!isAutoMode) break;
    }

    const combinedError = errors.length > 1
      ? `Todos los motores fallaron: ${errors.join(" | ")}`
      : errors[0] || "Error desconocido del proveedor.";

    return errorResponse("create_task", enginesToTry[0], combinedError, true, 502);

  } catch (e: any) {
    console.error("[generate-video] Unhandled error:", e);
    return errorResponse("unhandled", "", e?.message || "Error desconocido.", false, 500);
  }
});
