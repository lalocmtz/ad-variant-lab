import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(JSON.stringify({ error: "taskId es requerido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(JSON.stringify({ error: "KIE_API_KEY no está configurada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.kie.ai/api/v1/jobs/task/${encodeURIComponent(taskId)}`;
    console.log("Polling Kie AI task:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    // --- Handle HTTP errors ---
    if (!response.ok) {
      const errText = await response.text();
      console.error("Kie AI getTask error:", response.status, errText);

      // 404 = task not found or invalid endpoint - stop polling immediately
      if (response.status === 404) {
        return new Response(JSON.stringify({
          taskId,
          status: "failed",
          videoUrl: null,
          error: "No se pudo consultar el estado del video en el proveedor (404). La tarea puede no existir.",
          shouldStopPolling: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        taskId,
        status: "failed",
        videoUrl: null,
        error: `Error consultando estado del video (${response.status}).`,
        shouldStopPolling: response.status >= 400 && response.status < 500,
      }), {
        status: 200, // Return 200 so frontend can parse the failure
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse response ---
    let data: Record<string, unknown>;
    try {
      const text = await response.text();
      data = JSON.parse(text);
      console.log("Kie AI task response:", text.substring(0, 500));
    } catch {
      return new Response(JSON.stringify({
        taskId,
        status: "failed",
        videoUrl: null,
        error: "Respuesta inválida del proveedor al consultar estado.",
        shouldStopPolling: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for application-level error code
    const kieCode = (data as any).code;
    if (kieCode !== undefined && kieCode !== 200) {
      const msg = (data as any).msg || `Error del proveedor (código ${kieCode})`;
      console.error("Kie AI task application error:", kieCode, msg);
      return new Response(JSON.stringify({
        taskId,
        status: "failed",
        videoUrl: null,
        error: msg,
        shouldStopPolling: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taskData = (data as any).data || data;

    // --- Normalize status ---
    const providerStatus = String(taskData.status || "").toLowerCase();
    let normalizedStatus: string;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;
    let progress: number | null = null;
    let shouldStopPolling = false;

    if (["completed", "success", "done"].includes(providerStatus)) {
      normalizedStatus = "completed";
      shouldStopPolling = true;
      // Extract video URL from all possible response shapes
      videoUrl = taskData.output?.video_url
        || taskData.output?.url
        || taskData.video_url
        || taskData.result?.video_url
        || taskData.result?.url
        || (Array.isArray(taskData.output) ? taskData.output[0]?.url : null)
        || (Array.isArray(taskData.output) ? taskData.output[0]?.video_url : null)
        || null;

      if (!videoUrl) {
        // Log full data shape to debug missing URL
        console.warn("Task completed but no videoUrl found. Data keys:", JSON.stringify(Object.keys(taskData)));
        if (taskData.output) console.warn("output:", JSON.stringify(taskData.output).substring(0, 500));
        if (taskData.result) console.warn("result:", JSON.stringify(taskData.result).substring(0, 500));
      }
    } else if (["failed", "error", "failure"].includes(providerStatus)) {
      normalizedStatus = "failed";
      shouldStopPolling = true;
      errorMessage = taskData.error || taskData.message || taskData.msg || "La generación de video falló.";
    } else if (["processing", "running", "in_progress"].includes(providerStatus)) {
      normalizedStatus = "processing";
      progress = taskData.progress ?? null;
    } else if (["queued", "pending", "waiting", "created"].includes(providerStatus)) {
      normalizedStatus = "queued";
    } else {
      // Unknown status - keep polling but log it
      normalizedStatus = "processing";
      console.warn("Unknown provider status:", providerStatus, "- treating as processing");
    }

    return new Response(JSON.stringify({
      taskId,
      status: normalizedStatus,
      videoUrl,
      error: errorMessage,
      progress,
      providerStatus,
      shouldStopPolling,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("get-video-task error:", e);
    return new Response(JSON.stringify({
      error: e?.message || "Error desconocido.",
      status: "failed",
      shouldStopPolling: true,
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
