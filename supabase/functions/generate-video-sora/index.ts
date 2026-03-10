import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ── Prompt builder ──

const MAX_PROMPT_CHARS = 2000;

function buildVideoPrompt(rawPrompt: string, language: string, accent: string): string {
  const langLabel = language === "es-MX" ? "español mexicano" : language === "es-CO" ? "español colombiano" : language === "es-ES" ? "español de España" : language === "en-US" ? "English (US)" : language;
  const isSpanish = language.startsWith("es");

  const suffix = `

MANDATORY VIDEO RULES:
- Use the attached image as the actor identity and first-frame reference.
- Create a natural handheld 9:16 vertical UGC-style video.
- Duration: approximately 9 seconds. Fill the entire duration with fluid motion.
- No subtitles, captions, text overlays, stickers, or motion graphics.
- No spoken audio — this is a SILENT video clip.
- Audio/voiceover will be added separately in post-production.
- Clean native smartphone recording style.
- Smooth natural motion, slight handheld movement.

LANGUAGE CONTEXT: Visual text/signs should be in ${langLabel}${isSpanish ? `, accent context: ${accent}` : ""}.
${isSpanish ? `MANDATORY: Use Mexican Spanish (es-MX) context. Natural Mexican vocabulary. No Argentine, Spanish, or neutral corporate tone.` : ""}`;

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

function errorResponse(stage: string, error: string, httpStatus = 400) {
  return jsonResponse({ ok: false, stage, engine: "sora2", error, retryable: false }, httpStatus);
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantId, imageUrl, promptText, language, accent } = await req.json();

    console.log("[generate-video] Request:", JSON.stringify({
      variantId,
      imageUrlPreview: imageUrl?.substring(0, 80),
      promptLength: promptText?.length,
      language,
      accent,
    }));

    // ── Input validation ──
    if (!variantId) return errorResponse("validation", "variantId es requerido.", 400);
    if (!imageUrl) return errorResponse("validation", "La imagen de la variante es requerida.", 400);
    if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:"))
      return errorResponse("validation", "La imagen debe ser una URL pública (no base64/blob).", 400);
    if (!isValidHttpUrl(imageUrl))
      return errorResponse("validation", "imageUrl no es una URL HTTP/HTTPS válida.", 400);
    if (!promptText || promptText.trim().length < 20)
      return errorResponse("validation", "El prompt es requerido (mínimo 20 caracteres).", 400);

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return errorResponse("config", "KIE_API_KEY no está configurada.", 500);

    const videoLanguage = language || "es-MX";
    const videoAccent = accent || "mexicano";

    const finalPrompt = buildVideoPrompt(promptText, videoLanguage, videoAccent);
    console.log(`[generate-video] Final prompt for Sora 2: ${finalPrompt.length} chars`);

    // Sora 2 — single engine
    const requestBody = {
      model: "sora-2-image-to-video",
      input: {
        prompt: finalPrompt,
        image_urls: [imageUrl],
        aspect_ratio: "portrait",
        n_frames: "10",
        remove_watermark: true,
      },
    };

    console.log(`[generate-video] → Sora 2, endpoint: /jobs/createTask, prompt: ${finalPrompt.length} chars, duration: 9s`);

    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://api.kie.ai/api/v1/jobs/createTask",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${KIE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        30000,
      );
    } catch (e: any) {
      const msg = e?.name === "AbortError"
        ? "Timeout (30s) conectando con Sora 2"
        : `Error de red (Sora 2): ${e?.message}`;
      console.error(`[generate-video] ${msg}`);
      return errorResponse("create_task", msg, 502);
    }

    const responseText = await response.text();
    console.log(`[generate-video] Sora 2 HTTP ${response.status}, body: ${responseText.substring(0, 500)}`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      return errorResponse("create_task", "Respuesta no-JSON de Sora 2", 502);
    }

    if (!response.ok) {
      const statusErrors: Record<number, string> = {
        401: "Autenticación con el proveedor falló.",
        402: "Sin créditos suficientes.",
        422: "Parámetros inválidos.",
        429: "Límite de solicitudes. Intenta en unos minutos.",
      };
      const friendly = statusErrors[response.status] || `Sora 2 rechazó la solicitud (HTTP ${response.status})`;
      return errorResponse("create_task", `Sora 2: ${friendly}`, 502);
    }

    const kieCode = (data as any).code;
    if (kieCode !== undefined && kieCode !== 200) {
      const msg = (data as any).msg || `código ${kieCode}`;
      console.error(`[generate-video] Sora 2 app error: ${kieCode} ${msg}`);
      return errorResponse("create_task", `Sora 2: ${msg}`, 502);
    }

    const taskId = extractTaskId(data);
    if (!taskId) {
      console.error(`[generate-video] No taskId from Sora 2:`, JSON.stringify(data).substring(0, 500));
      return errorResponse("create_task", "Sora 2 no devolvió taskId.", 502);
    }

    return jsonResponse({
      ok: true,
      taskId,
      variantId,
      status: "queued",
      engine: "sora2",
      modelLabel: "Sora 2",
      fallbackUsed: false,
      spec: {
        aspect_ratio: "9:16",
        duration_seconds: 9,
        audio_expected: false,
      },
    });

  } catch (e: any) {
    console.error("[generate-video] Unhandled error:", e);
    return errorResponse("unhandled", e?.message || "Error desconocido.", 500);
  }
});
