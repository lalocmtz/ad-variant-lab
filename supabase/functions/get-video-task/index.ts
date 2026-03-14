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
  if (typeof taskData?.resultJson === "string" && taskData.resultJson.trim()) {
    try {
      const parsed = JSON.parse(taskData.resultJson);
      const url = parsed?.resultUrls?.[0] || parsed?.videoUrl || parsed?.video_url || parsed?.url || parsed?.output_url || null;
      if (url) return url;
    } catch { /* ignore */ }
  }
  if (taskData?.info?.resultUrls) {
    const urls = typeof taskData.info.resultUrls === "string" ? JSON.parse(taskData.info.resultUrls) : taskData.info.resultUrls;
    if (Array.isArray(urls) && urls[0]) return urls[0];
  }
  return taskData?.resultUrls?.[0] || taskData?.videoUrl || taskData?.video_url || taskData?.url || taskData?.output_url || null;
}

function extractFailMessage(taskData: Record<string, any>, topLevel: Record<string, any>): string {
  const candidates = [taskData?.failMsg, taskData?.fail_msg, taskData?.errorMessage, taskData?.error_message, taskData?.error, topLevel?.msg, topLevel?.message];
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

// ── fal.ai polling ──

async function pollFal(requestId: string, FAL_API_KEY: string): Promise<Record<string, unknown>> {
  // Check status first
  const statusUrl = `https://queue.fal.run/fal-ai/sora-2/image-to-video/requests/${requestId}/status`;
  console.log(`[get-video-task] fal.ai status poll: ${statusUrl}`);

  let statusResp: Response;
  try {
    statusResp = await fetchWithTimeout(statusUrl, {
      method: "GET",
      headers: { Authorization: `Key ${FAL_API_KEY}` },
    }, 15000);
  } catch (e: any) {
    console.warn("[get-video-task] fal.ai status fetch error:", e?.message);
    return { ok: true, status: "processing", videoUrl: null, error: null, shouldStopPolling: false };
  }

  const statusText = await statusResp.text();
  console.log(`[get-video-task] fal.ai status HTTP ${statusResp.status}: ${statusText.substring(0, 500)}`);

  let statusData: any;
  try { statusData = JSON.parse(statusText); } catch {
    return { ok: true, status: "processing", videoUrl: null, error: null, shouldStopPolling: false };
  }

  const falStatus = statusData?.status;

  if (falStatus === "COMPLETED") {
    // Fetch result
    const resultUrl = `https://queue.fal.run/fal-ai/sora-2/image-to-video/requests/${requestId}`;
    try {
      const resultResp = await fetchWithTimeout(resultUrl, {
        method: "GET",
        headers: { Authorization: `Key ${FAL_API_KEY}` },
      }, 15000);
      const resultText = await resultResp.text();
      const resultData = JSON.parse(resultText);
      const videoUrl = resultData?.video?.url || resultData?.data?.video?.url || null;

      if (videoUrl) {
        console.log("[get-video-task] ✓ fal.ai video URL:", videoUrl);
        return { ok: true, status: "completed", videoUrl, error: null, shouldStopPolling: true, engine: "fal" };
      } else {
        console.warn("[get-video-task] fal.ai completed but no video URL:", resultText.substring(0, 500));
        return { ok: false, status: "failed", videoUrl: null, error: "fal.ai completed but no video URL", shouldStopPolling: true };
      }
    } catch (e: any) {
      return { ok: false, status: "failed", videoUrl: null, error: `fal.ai result fetch error: ${e?.message}`, shouldStopPolling: true };
    }
  }

  if (falStatus === "FAILED") {
    const errMsg = statusData?.error || "fal.ai generation failed";
    console.error("[get-video-task] fal.ai task failed:", errMsg);
    return { ok: false, status: "failed", videoUrl: null, error: errMsg, shouldStopPolling: true };
  }

  // IN_QUEUE, IN_PROGRESS, etc.
  return { ok: true, status: "processing", videoUrl: null, error: null, shouldStopPolling: false };
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { taskId, engine } = await req.json();

    if (!taskId) {
      return jsonOk({ ok: false, stage: "validation", error: "taskId es requerido.", shouldStopPolling: true });
    }

    // ── fal.ai routing ──
    if (typeof taskId === "string" && taskId.startsWith("fal:")) {
      const FAL_API_KEY = Deno.env.get("FAL_API_KEY");
      if (!FAL_API_KEY) {
        return jsonOk({ ok: false, stage: "config", error: "FAL_API_KEY no configurada.", shouldStopPolling: true });
      }
      const falRequestId = taskId.substring(4); // strip "fal:" prefix
      const result = await pollFal(falRequestId, FAL_API_KEY);
      return jsonOk({ taskId, ...result });
    }

    // ── KIE routing (default) ──
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
      return jsonOk({ ok: true, taskId, status: "processing", videoUrl: null, error: null, shouldStopPolling: false });
    }

    const rawText = await response.text();
    console.log(`[get-video-task] HTTP ${response.status}, length: ${rawText.length}, preview: ${rawText.substring(0, 800)}`);

    let data: Record<string, any>;
    try { data = JSON.parse(rawText); } catch {
      return jsonOk({ ok: true, taskId, status: "processing", videoUrl: null, error: null, shouldStopPolling: false });
    }

    if (!response.ok) {
      const shouldStop = response.status >= 400 && response.status < 500;
      return jsonOk({
        ok: false, taskId, stage: "poll",
        status: shouldStop ? "failed" : "processing",
        videoUrl: null, error: data?.message || data?.msg || `Error HTTP ${response.status}`,
        shouldStopPolling: shouldStop, retryable: !shouldStop,
      });
    }

    const kieCode = data?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      if (kieCode === 400 && typeof data?.msg === "string" && data.msg.includes("1080P is processing")) {
        return jsonOk({ ok: true, taskId, status: "processing", videoUrl: null, error: null, shouldStopPolling: false });
      }
      return jsonOk({
        ok: false, taskId, stage: "poll", status: "failed", videoUrl: null,
        error: data?.msg || `Error del proveedor (código ${kieCode}).`, shouldStopPolling: true, retryable: false,
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
      const veoStatus = taskData?.status ?? taskData?.state;
      const veoStatusNum = typeof veoStatus === "number" ? veoStatus : parseInt(String(veoStatus), 10);
      if (veoStatusNum === 1) {
        const infoUrls = taskData?.info?.resultUrls;
        if (typeof infoUrls === "string") {
          try { const parsed = JSON.parse(infoUrls); videoUrl = Array.isArray(parsed) ? parsed[0] : null; } catch { /* */ }
        } else if (Array.isArray(infoUrls)) { videoUrl = infoUrls[0] || null; }
        if (!videoUrl) videoUrl = extractVideoUrl(taskData);
        normalizedStatus = videoUrl ? "completed" : "failed";
        if (!videoUrl) errorMessage = "Veo reportó éxito pero no devolvió URL de video.";
        shouldStopPolling = true;
      } else if (veoStatusNum === 2 || veoStatusNum === 3) {
        normalizedStatus = "failed"; shouldStopPolling = true;
        errorMessage = taskData?.failMsg || taskData?.errorMessage || data?.msg || "La generación de video Veo falló.";
      }
    } else {
      providerState = String(taskData?.state || "").toLowerCase();
      switch (providerState) {
        case "waiting": case "queuing": normalizedStatus = "queued"; break;
        case "generating": case "processing": normalizedStatus = "processing"; break;
        case "success": case "completed": {
          videoUrl = extractVideoUrl(taskData);
          normalizedStatus = videoUrl ? "completed" : "failed";
          if (!videoUrl) errorMessage = "Tarea completada pero sin URL de video.";
          shouldStopPolling = true;
          break;
        }
        case "fail": case "failed": case "error": {
          normalizedStatus = "failed"; shouldStopPolling = true;
          errorMessage = extractFailMessage(taskData, data);
          break;
        }
        default: normalizedStatus = "processing"; break;
      }
    }

    return jsonOk({
      ok: normalizedStatus !== "failed", taskId, stage: "poll",
      status: normalizedStatus, providerState, engine: engineModel,
      videoUrl, error: errorMessage, shouldStopPolling, retryable: normalizedStatus === "failed",
    });
  } catch (e: any) {
    console.error("[get-video-task] Unhandled error:", e);
    return new Response(
      JSON.stringify({ ok: false, stage: "unhandled", error: e?.message || "Error desconocido.", status: "failed", shouldStopPolling: true, retryable: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
