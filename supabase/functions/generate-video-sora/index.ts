import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SANITIZATION_SUFFIX = `

MANDATORY VIDEO RULES:
- This video must be EXACTLY 15 seconds long
- Do NOT add any on-screen text, subtitles, or captions
- Do NOT render comment bubbles or social media UI elements
- Do NOT add watermarks, stickers, or motion graphics
- Do NOT add floating text, price tags, or text cards
- Keep the result looking like a clean native camera recording
- Preserve the generated image as the actor identity and first-frame visual reference
- Keep the actor visually consistent with the reference image throughout
- Animate naturally from that identity with handheld UGC realism
- Preserve the same creator role, market fit, and trust profile
- Preserve the exact uploaded product appearance`;

function sanitizePrompt(promptText: string): string {
  // If prompt already mentions key rules, still append to reinforce
  let sanitized = promptText.trim();
  
  // Truncate if excessively long (Sora has limits)
  if (sanitized.length > 12000) {
    // Find the JSON block and keep it, trim the prose
    const jsonStart = sanitized.indexOf('"video_metadata"');
    if (jsonStart > 0) {
      const beforeJson = sanitized.substring(0, Math.min(3000, jsonStart));
      const fromJson = sanitized.substring(jsonStart - 10); // include the opening brace
      sanitized = beforeJson + "\n...\n" + fromJson;
    } else {
      sanitized = sanitized.substring(0, 12000);
    }
  }
  
  sanitized += SANITIZATION_SUFFIX;
  return sanitized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantId, imageUrl, promptText, mode } = await req.json();

    // Validation
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "La imagen de la variante es requerida." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!promptText || promptText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "El prompt de animación es requerido y debe ser suficientemente detallado." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!variantId) {
      return new Response(JSON.stringify({ error: "variantId es requerido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(JSON.stringify({ error: "KIE_API_KEY no está configurada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize prompt
    const sanitizedPrompt = sanitizePrompt(promptText);

    // Determine model
    const generationMode = mode || "standard";
    const model = generationMode === "pro" ? "sora-2-pro-image-to-video" : "sora-2-image-to-video";

    // Build request body
    const requestBody: Record<string, unknown> = {
      model,
      input: {
        prompt: sanitizedPrompt,
        image_urls: [imageUrl],
        aspect_ratio: "portrait",
        n_frames: "15",
        remove_watermark: true,
      },
    };

    // Add size param for pro mode
    if (generationMode === "pro") {
      (requestBody.input as Record<string, unknown>).size = "standard";
    }

    console.log("Sending to Kie AI:", {
      variantId,
      model,
      imageUrlLength: imageUrl.length,
      promptLength: sanitizedPrompt.length,
    });

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

    if (!response.ok) {
      const errorMap: Record<number, string> = {
        401: "La autenticación con el proveedor de video falló.",
        402: "No hay créditos suficientes para generar el video.",
        422: "La solicitud de video fue rechazada por parámetros inválidos.",
        429: "Se alcanzó el límite temporal de solicitudes. Intenta de nuevo.",
      };
      const friendlyError = errorMap[response.status] || `La generación de video falló en el proveedor (${response.status}).`;
      return new Response(JSON.stringify({ error: friendlyError, provider_status: response.status }), {
        status: response.status >= 500 ? 502 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ error: "Respuesta inválida del proveedor de video." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taskId = data.data?.taskId || data.taskId || data.data?.task_id || data.task_id;
    if (!taskId) {
      console.error("No taskId in response:", JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({ error: "El proveedor no devolvió un taskId válido." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      taskId,
      variantId,
      status: "queued",
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
