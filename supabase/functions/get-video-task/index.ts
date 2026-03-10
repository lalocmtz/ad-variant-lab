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

  // Try info.resultUrls (Veo 3.1 format)
  if (taskData?.info?.resultUrls) {
    const urls = typeof taskData.info.resultUrls === "string"
      ? JSON.parse(taskData.info.resultUrls)
      : taskData.info.resultUrls;
    if (Array.isArray(urls) && urls[0]) return urls[0];
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
    const { taskId, engine } = await req.json();

    if (!taskId) {
      return jsonOk({ ok: false, stage: "validation", error: "taskId es requerido.", shouldStopPolling: true });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return jsonOk({ ok: false, stage: "config", error: "KIE_API_KEY no está configurada.", shouldStopPolling: true });
    }

    const isVeo = typeof engine === "string" && engine.startsWith("veo3");
    const url = isVeo
      ? `https://api.kie.ai/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`
      : `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    console.log(`[get-video-task] Polling (${isVeo ? "veo" : "legacy"}):`, url);

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${KIE_API_KEY}` },
      }, 15000);
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      console.error(`[get-video-task] Fetch ${isTimeout ? "timeout" : "error"}:`, e?.message);
      return jsonOk({
        ok: true,
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
        ok: true,
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
        ok: false,
        taskId,
        stage: "poll",
        status: shouldStop ? "failed" : "processing",
        videoUrl: null,
        error: data?.message || data?.msg || `Error HTTP ${response.status}`,
        shouldStopPolling: shouldStop,
        retryable: !shouldStop,
      });
    }

    const kieCode = data?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      // Veo 3.1 may return code 400 for "1080P is processing" — keep polling
      if (kieCode === 400 && typeof data?.msg === "string" && data.msg.includes("1080P is processing")) {
        console.log("[get-video-task] Veo 1080P still processing, keep polling");
        return jsonOk({
          ok: true,
          taskId,
          status: "processing",
          videoUrl: null,
          error: null,
          shouldStopPolling: false,
        });
      }

      return jsonOk({
        ok: false,
        taskId,
        stage: "poll",
        status: "failed",
        videoUrl: null,
        error: data?.msg || `Error del proveedor (código ${kieCode}).`,
        shouldStopPolling: true,
        retryable: false,
      });
    }

    const taskData = data?.data || {};
    const engineModel = taskData?.model || engine || "";
    
    let normalizedStatus = "processing";
    let shouldStopPolling = false;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;
    let providerState: string = "";

    if (isVeo) {
      // Veo uses numeric status: 0=generating, 1=success, 2=failed, 3=generation_failed
      const veoStatus = taskData?.status ?? taskData?.state;
      const veoStatusNum = typeof veoStatus === "number" ? veoStatus : parseInt(String(veoStatus), 10);
      console.log(`[get-video-task] Veo status: ${veoStatus} (parsed: ${veoStatusNum}), model: ${engineModel}`);

      if (veoStatusNum === 1) {
        // Success — extract URL from Veo response shape
        const infoUrls = taskData?.info?.resultUrls;
        if (typeof infoUrls === "string") {
          try { const parsed = JSON.parse(infoUrls); videoUrl = Array.isArray(parsed) ? parsed[0] : null; } catch { /* ignore */ }
        } else if (Array.isArray(infoUrls)) {
          videoUrl = infoUrls[0] || null;
        }
        // Also try direct resultUrls
        if (!videoUrl) videoUrl = extractVideoUrl(taskData);
        
        if (videoUrl) {
          normalizedStatus = "completed";
          console.log("[get-video-task] ✓ Veo Video URL:", videoUrl);
        } else {
          normalizedStatus = "failed";
          errorMessage = "Veo reportó éxito pero no devolvió URL de video.";
          console.warn("[get-video-task] Veo success but no videoUrl. taskData:", JSON.stringify(taskData).substring(0, 1000));
        }
        shouldStopPolling = true;
      } else if (veoStatusNum === 2 || veoStatusNum === 3) {
        normalizedStatus = "failed";
        shouldStopPolling = true;
        errorMessage = taskData?.failMsg || taskData?.errorMessage || data?.msg || "La generación de video Veo falló.";
        console.error(`[get-video-task] Veo task failed (status ${veoStatusNum}): ${errorMessage}`);
      } else {
        // 0 or unknown = still generating
        normalizedStatus = "processing";
      }
    } else {
      // Legacy engines (Kling, Hailuo, Wan, Sora)
      providerState = String(taskData?.state || "").toLowerCase();
      console.log(`[get-video-task] Legacy state: ${providerState}, model: ${engineModel}`);

      switch (providerState) {
        case "waiting":
        case "queuing":
          normalizedStatus = "queued";
          break;
        case "generating":
        case "processing":
          normalizedStatus = "processing";
          break;
        case "success":
        case "completed": {
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
          console.warn(`[get-video-task] Unknown state: "${providerState}"`);
          normalizedStatus = "processing";
          break;
      }
    }

    return jsonOk({
      ok: normalizedStatus !== "failed",
      taskId,
      stage: "poll",
      status: normalizedStatus,
      providerState,
      engine: engineModel,
      videoUrl,
      error: errorMessage,
      shouldStopPolling,
      retryable: normalizedStatus === "failed",
    });
  } catch (e: any) {
    console.error("[get-video-task] Unhandled error:", e);
    return new Response(
      JSON.stringify({ ok: false, stage: "unhandled", error: e?.message || "Error desconocido.", status: "failed", shouldStopPolling: true, retryable: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
