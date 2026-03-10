import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractVideoUrl(taskData: Record<string, any>): string | null {
  // Try resultJson first (may be a JSON string)
  if (typeof taskData?.resultJson === "string" && taskData.resultJson.trim()) {
    try {
      const parsed = JSON.parse(taskData.resultJson);
      const url =
        parsed?.resultUrls?.[0] ||
        parsed?.videoUrl ||
        parsed?.video_url ||
        parsed?.url ||
        parsed?.output_url ||
        null;
      if (url) return url;
    } catch {
      console.warn("[get-video-task] resultJson parse failed");
    }
  }

  // Try direct fields
  return (
    taskData?.resultUrls?.[0] ||
    taskData?.videoUrl ||
    taskData?.video_url ||
    taskData?.url ||
    taskData?.output_url ||
    null
  );
}

function extractFailMessage(taskData: Record<string, any>, topLevel: Record<string, any>): string {
  // Check all known error fields
  const candidates = [
    taskData?.failMsg,
    taskData?.fail_msg,
    taskData?.errorMessage,
    taskData?.error_message,
    taskData?.error,
    topLevel?.msg,
    topLevel?.message,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }

  // Try inside resultJson
  if (typeof taskData?.resultJson === "string" && taskData.resultJson.trim()) {
    try {
      const parsed = JSON.parse(taskData.resultJson);
      const innerError = parsed?.error || parsed?.errorMessage || parsed?.failMsg;
      if (typeof innerError === "string" && innerError.trim()) return innerError;
    } catch { /* ignore */ }
  }

  return "La generación de video falló en el proveedor.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return jsonOk({ error: "taskId es requerido.", shouldStopPolling: true });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return jsonOk({ error: "KIE_API_KEY no está configurada.", shouldStopPolling: true });
    }

    const url = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    console.log("[get-video-task] Polling:", url);

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${KIE_API_KEY}` },
      }, 15000);
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      console.error(`[get-video-task] Fetch ${isTimeout ? "timeout" : "error"}:`, e?.message);
      // Network/timeout errors are retryable
      return jsonOk({
        taskId,
        status: "processing",
        videoUrl: null,
        error: null,
        shouldStopPolling: false,
      });
    }

    const rawText = await response.text();
    console.log(`[get-video-task] HTTP ${response.status}, length: ${rawText.length}, preview: ${rawText.substring(0, 800)}`);

    let data: Record<string, any>;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("[get-video-task] Non-JSON response");
      return jsonOk({
        taskId,
        status: "processing",
        videoUrl: null,
        error: null,
        shouldStopPolling: false,
      });
    }

    if (!response.ok) {
      const shouldStop = response.status >= 400 && response.status < 500;
      return jsonOk({
        taskId,
        status: shouldStop ? "failed" : "processing",
        videoUrl: null,
        error: data?.message || data?.msg || `Error HTTP ${response.status}`,
        shouldStopPolling: shouldStop,
      });
    }

    const kieCode = data?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      return jsonOk({
        taskId,
        status: "failed",
        videoUrl: null,
        error: data?.msg || `Error del proveedor (código ${kieCode}).`,
        shouldStopPolling: true,
      });
    }

    const taskData = data?.data || {};
    const providerState = String(taskData?.state || "").toLowerCase();
    console.log(`[get-video-task] State: ${providerState}`);

    let normalizedStatus = "processing";
    let shouldStopPolling = false;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;

    switch (providerState) {
      case "waiting":
      case "queuing":
        normalizedStatus = "queued";
        break;

      case "generating":
        normalizedStatus = "processing";
        break;

      case "success": {
        videoUrl = extractVideoUrl(taskData);
        if (videoUrl) {
          normalizedStatus = "completed";
          console.log("[get-video-task] ✓ Video URL:", videoUrl);
        } else {
          normalizedStatus = "failed";
          errorMessage = "Tarea completada pero sin URL de video.";
          console.warn("[get-video-task] Success but no videoUrl. taskData:", JSON.stringify(taskData).substring(0, 1000));
        }
        shouldStopPolling = true;
        break;
      }

      case "fail":
      case "failed":
      case "error": {
        normalizedStatus = "failed";
        shouldStopPolling = true;
        errorMessage = extractFailMessage(taskData, data);
        console.error(`[get-video-task] Task failed: ${errorMessage}`);
        break;
      }

      default:
        // Unknown state — keep polling
        console.warn(`[get-video-task] Unknown state: "${providerState}"`);
        normalizedStatus = "processing";
        break;
    }

    return jsonOk({
      taskId,
      status: normalizedStatus,
      providerState,
      videoUrl,
      error: errorMessage,
      shouldStopPolling,
    });
  } catch (e: any) {
    console.error("[get-video-task] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Error desconocido.", status: "failed", shouldStopPolling: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
