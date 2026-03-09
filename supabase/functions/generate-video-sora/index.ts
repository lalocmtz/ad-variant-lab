import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SANITIZATION_SUFFIX = `

MANDATORY VIDEO RULES:
- Use the attached generated image as the actor identity and first-frame visual reference.
- Create a natural handheld 9:16 UGC-style video exactly 15 seconds long.
- Preserve the same winning persuasion structure, creator role, trust profile, and market fit.
- Preserve the exact uploaded product.
- Compress to 15 seconds by keeping only the highest-conversion beats:
  0.0-2.5s HOOK | 2.5-6.0s REFRAME/CONTEXT | 6.0-10.5s DEMO+PROOF | 10.5-12.5s OBJECTION | 12.5-15.0s CTA
- Do NOT add subtitles, captions, comment bubbles, on-screen text, social media UI, stickers, or motion graphics.
- Preserve comment-reply logic only as spoken context, never as visible text.
- Keep the final result looking like a clean native smartphone recording.
- Animate naturally from the reference image identity with handheld UGC realism.`;

function sanitizePrompt(promptText: string): string {
  let sanitized = promptText.trim();

  // Truncate if excessively long (Sora prompt max is 10000 chars)
  const MAX_PROMPT = 9500; // leave room for suffix
  if (sanitized.length > MAX_PROMPT) {
    // Try to preserve JSON blueprint section
    const jsonStart = sanitized.indexOf('"video_metadata"');
    if (jsonStart > 0) {
      const beforeJson = sanitized.substring(0, Math.min(2500, jsonStart));
      const fromJson = sanitized.substring(jsonStart - 10);
      sanitized = beforeJson + "\n...\n" + fromJson;
    } else {
      sanitized = sanitized.substring(0, MAX_PROMPT);
    }
  }

  sanitized += SANITIZATION_SUFFIX;

  // Final hard cap at 10000 (Kie AI limit)
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized;
}

const ERROR_MAP: Record<number, string> = {
  401: "La autenticación con Kie AI falló.",
  402: "No hay créditos suficientes para generar el video.",
  404: "No se pudo consultar el estado del video en el proveedor.",
  422: "La solicitud fue rechazada por parámetros inválidos.",
  429: "Se alcanzó el límite temporal de solicitudes. Intenta de nuevo.",
  455: "El servicio de video está temporalmente en mantenimiento.",
  500: "La generación falló en el proveedor.",
  501: "La generación falló en el proveedor.",
  505: "La función de generación de video está deshabilitada.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantId, imageUrl, promptText, mode } = await req.json();

    // --- Validation ---
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
    if (imageUrl.startsWith("data:")) {
      return new Response(JSON.stringify({ error: "La imagen de entrada no es pública y no puede ser usada por el generador. Sube la imagen primero." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!promptText || promptText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "El prompt de animación es requerido y debe ser suficientemente detallado." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(JSON.stringify({ error: "KIE_API_KEY no está configurada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Sanitize prompt ---
    const sanitizedPrompt = sanitizePrompt(promptText);

    // --- Build request body per Kie AI spec ---
    const generationMode = mode || "standard";
    const model = generationMode === "pro" ? "sora-2-pro-image-to-video" : "sora-2-image-to-video";

    const input: Record<string, unknown> = {
      prompt: sanitizedPrompt,
      image_urls: [imageUrl],
      aspect_ratio: "portrait",
      n_frames: "15",
      remove_watermark: true,
    };

    // Pro mode adds size param
    if (generationMode === "pro") {
      input.size = "standard";
    }

    const requestBody = { model, input };

    console.log("Sending to Kie AI:", {
      variantId,
      model,
      imageUrlPreview: imageUrl.substring(0, 80),
      promptLength: sanitizedPrompt.length,
    });

    // --- Call Kie AI ---
    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("Kie AI response status:", response.status, "body preview:", responseText.substring(0, 500));

    // --- Parse response ---
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ error: "Respuesta inválida del proveedor de video." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HTTP-level failure
    if (!response.ok) {
      const friendlyError = ERROR_MAP[response.status] || `La generación de video falló en el proveedor (HTTP ${response.status}).`;
      return new Response(JSON.stringify({ error: friendlyError, provider_status: response.status }), {
        status: response.status >= 500 ? 502 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Application-level failure (Kie returns 200 HTTP but error code in JSON)
    const kieCode = (data as any).code;
    if (kieCode !== undefined && kieCode !== 200) {
      const friendlyError = ERROR_MAP[kieCode] || `Error del proveedor de video (código ${kieCode}): ${(data as any).msg || "desconocido"}`;
      console.error("Kie AI application error:", kieCode, (data as any).msg);
      return new Response(JSON.stringify({ error: friendlyError, provider_code: kieCode, provider_msg: (data as any).msg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Extract taskId ---
    const taskId = (data as any).data?.taskId
      || (data as any).taskId
      || (data as any).data?.task_id
      || (data as any).task_id;

    if (!taskId) {
      console.error("No taskId in response:", JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({ error: "El proveedor no devolvió un taskId válido." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Success ---
    return new Response(JSON.stringify({
      taskId,
      variantId,
      status: "queued",
      imageUrl,
      provider: "kie_sora2",
      model,
      mode: generationMode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("generate-video-sora error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error desconocido al generar video." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
