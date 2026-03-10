import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Provider Registry ──

interface ProviderConfig {
  label: string;
  kieModelId: string;
  buildInput: (prompt: string, imageUrl: string) => Record<string, unknown>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  sora2: {
    label: "Sora 2",
    kieModelId: "sora-2-image-to-video",
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      aspect_ratio: "portrait",
      n_frames: "15",
      remove_watermark: true,
    }),
  },
  hailuo: {
    label: "Hailuo 2.3 Pro",
    kieModelId: "hailuo/2-3-image-to-video-pro",
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: "9:16",
      duration: 5,
    }),
  },
  wan: {
    label: "Wan 2.6",
    kieModelId: "wan/2-6-image-to-video",
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: "9:16",
    }),
  },
  kling: {
    label: "Kling 2.6",
    kieModelId: "kling-2.6/image-to-video",
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_url: imageUrl,
      aspect_ratio: "9:16",
      duration: "5",
    }),
  },
};

// Auto fallback chain: try these in order
const AUTO_CHAIN: string[] = ["hailuo", "wan", "sora2"];

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

// ── Prompt sanitization ──

const MAX_PROMPT_CHARS = 2000;

function buildSanitizationSuffix(language: string, accent: string): string {
  const langLabel = language === "es-MX" ? "español mexicano" : language === "es-CO" ? "español colombiano" : language === "es-ES" ? "español de España" : language === "es-US" ? "español estadounidense" : language === "en-US" ? "English (US)" : language;
  const isSpanish = language.startsWith("es");

  return `

MANDATORY VIDEO RULES:
- Use the attached image as the actor identity and first-frame reference.
- Create a natural handheld 9:16 UGC-style video exactly 15 seconds long.
- Compress to 15s: 0-2.5s HOOK | 2.5-6s CONTEXT | 6-10.5s DEMO | 10.5-12.5s OBJECTION | 12.5-15s CTA.
- No subtitles, captions, text overlays, stickers, or motion graphics.
- Clean native smartphone recording style.

LANGUAGE: All spoken dialogue in ${langLabel}, accent: ${accent}.${isSpanish ? ` Natural ${langLabel} vocabulary.` : ""}`;
}

function sanitizePrompt(promptText: string, language: string, accent: string): string {
  const suffix = buildSanitizationSuffix(language, accent);
  const maxBase = MAX_PROMPT_CHARS - suffix.length;

  let sanitized = promptText.trim();
  if (sanitized.length > maxBase) {
    console.log(`[generate-video-sora] Truncating prompt from ${sanitized.length} to ${maxBase} chars`);
    sanitized = sanitized.substring(0, maxBase);
  }

  sanitized += suffix;
  return sanitized;
}

// ── Error map ──

const ERROR_MAP: Record<number, string> = {
  401: "La autenticación con el proveedor falló.",
  402: "No hay créditos suficientes para generar el video.",
  404: "Recurso no encontrado en el proveedor.",
  422: "La solicitud fue rechazada por parámetros inválidos.",
  429: "Límite de solicitudes alcanzado. Intenta en unos minutos.",
  455: "El servicio de video está en mantenimiento.",
  500: "Error interno del proveedor.",
  501: "Error interno del proveedor.",
  505: "Función de generación deshabilitada.",
};

// ── Attempt a single model ──

async function attemptCreateTask(
  providerKey: string,
  sanitizedPrompt: string,
  imageUrl: string,
  apiKey: string,
): Promise<{ taskId: string; model: string; provider: string } | { error: string; httpStatus?: number }> {
  const config = PROVIDERS[providerKey];
  if (!config) return { error: `Proveedor desconocido: ${providerKey}` };

  const input = config.buildInput(sanitizedPrompt, imageUrl);
  const requestBody = { model: config.kieModelId, input };

  console.log(`[generate-video-sora] Trying ${config.label} (${config.kieModelId}), prompt length: ${sanitizedPrompt.length}`);

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
      ? `Timeout (30s) conectando con ${config.label}`
      : `Error de red (${config.label}): ${e?.message}`;
    console.error(`[generate-video-sora] ${msg}`);
    return { error: msg };
  }

  const responseText = await response.text();
  console.log(`[generate-video-sora] ${config.label} HTTP ${response.status}, body: ${responseText.substring(0, 500)}`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { error: `Respuesta no-JSON de ${config.label}`, httpStatus: 502 };
  }

  if (!response.ok) {
    const friendlyError = ERROR_MAP[response.status] || `${config.label} rechazó (HTTP ${response.status})`;
    return { error: friendlyError, httpStatus: response.status };
  }

  const kieCode = (data as any).code;
  if (kieCode !== undefined && kieCode !== 200) {
    const msg = (data as any).msg || `código ${kieCode}`;
    console.error(`[generate-video-sora] ${config.label} app error: ${kieCode} ${msg}`);
    return { error: `${config.label}: ${msg}` };
  }

  const taskId = extractTaskId(data);
  if (!taskId) {
    console.error(`[generate-video-sora] No taskId from ${config.label}:`, JSON.stringify(data).substring(0, 500));
    return { error: `${config.label} no devolvió taskId.` };
  }

  return { taskId, model: config.kieModelId, provider: providerKey };
}

// ── Main ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantId, imageUrl, promptText, mode, language, accent, model } = await req.json();

    console.log("[generate-video-sora] Request:", JSON.stringify({
      variantId,
      imageUrlPreview: imageUrl?.substring(0, 80),
      promptLength: promptText?.length,
      mode,
      language,
      accent,
      model,
    }));

    // ── Validation ──
    if (!variantId) {
      return new Response(JSON.stringify({ error: "variantId es requerido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "La imagen de la variante es requerida." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) {
      return new Response(JSON.stringify({ error: "La imagen debe ser una URL pública (no base64/blob). Sube la imagen primero." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isValidHttpUrl(imageUrl)) {
      return new Response(JSON.stringify({ error: "imageUrl no es una URL HTTP/HTTPS válida." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!promptText || promptText.trim().length < 20) {
      return new Response(JSON.stringify({ error: "El prompt de animación es requerido (mínimo 20 caracteres)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(JSON.stringify({ error: "KIE_API_KEY no está configurada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoLanguage = language || "es-MX";
    const videoAccent = accent || "mexicano";
    const sanitizedPrompt = sanitizePrompt(promptText, videoLanguage, videoAccent);
    console.log(`[generate-video-sora] Final prompt length: ${sanitizedPrompt.length}`);

    // ── Determine which models to try ──
    const modelsToTry: string[] = model && PROVIDERS[model]
      ? [model]                // User chose specific model
      : [...AUTO_CHAIN];       // Auto fallback chain

    const errors: string[] = [];

    for (let i = 0; i < modelsToTry.length; i++) {
      const providerKey = modelsToTry[i];
      const result = await attemptCreateTask(providerKey, sanitizedPrompt, imageUrl, KIE_API_KEY);

      if ("taskId" in result) {
        return new Response(JSON.stringify({
          taskId: result.taskId,
          variantId,
          status: "queued",
          imageUrl,
          provider: result.provider,
          model: result.model,
          modelLabel: PROVIDERS[result.provider]?.label || result.provider,
          mode: mode || "standard",
          fallbackUsed: i > 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      errors.push(result.error);
      console.warn(`[generate-video-sora] ${providerKey} failed: ${result.error}. ${i < modelsToTry.length - 1 ? "Trying next..." : "No more fallbacks."}`);
    }

    const combinedError = errors.length > 1
      ? `Todos los motores fallaron: ${errors.join(" | ")}`
      : errors[0] || "Error desconocido del proveedor.";

    console.error(`[generate-video-sora] All models failed:`, combinedError);

    return new Response(JSON.stringify({ error: combinedError, fallbackUsed: modelsToTry.length > 1 }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[generate-video-sora] Unhandled error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error desconocido al generar video." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
