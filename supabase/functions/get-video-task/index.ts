import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "taskId es requerido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "KIE_API_KEY no está configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
    console.log("[get-video-task] Polling Kie task:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${KIE_API_KEY}` },
    });

    const rawText = await response.text();
    console.log("[get-video-task] Raw response:", rawText.substring(0, 1500));

    let data: Record<string, any>;
    try {
      data = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({
          taskId, status: "failed", videoUrl: null,
          error: "Respuesta inválida del proveedor al consultar estado.",
          shouldStopPolling: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          taskId, status: "failed", videoUrl: null,
          error: data?.message || data?.msg || `Error consultando estado (${response.status}).`,
          shouldStopPolling: response.status >= 400 && response.status < 500,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const kieCode = data?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      return new Response(
        JSON.stringify({
          taskId, status: "failed", videoUrl: null,
          error: data?.msg || `Error del proveedor (código ${kieCode}).`,
          shouldStopPolling: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskData = data?.data || {};
    const providerState = String(taskData?.state || "").toLowerCase();
    console.log("[get-video-task] Provider state:", providerState);

    let normalizedStatus: string = "processing";
    let shouldStopPolling = false;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;

    if (providerState === "waiting" || providerState === "queuing") {
      normalizedStatus = "queued";
    } else if (providerState === "generating") {
      normalizedStatus = "processing";
    } else if (providerState === "success") {
      normalizedStatus = "completed";
      shouldStopPolling = true;

      let parsedResult: any = null;
      if (typeof taskData?.resultJson === "string" && taskData.resultJson.trim()) {
        try { parsedResult = JSON.parse(taskData.resultJson); } catch {}
      }

      videoUrl =
        parsedResult?.resultUrls?.[0] ||
        parsedResult?.videoUrl ||
        parsedResult?.video_url ||
        taskData?.resultUrls?.[0] ||
        taskData?.videoUrl ||
        taskData?.video_url ||
        null;

      console.log("[get-video-task] Extracted videoUrl:", videoUrl);

      if (!videoUrl) {
        normalizedStatus = "failed";
        errorMessage = "La tarea terminó en success pero no devolvió una URL de video.";
        console.warn("[get-video-task] No videoUrl found. taskData:", JSON.stringify(taskData).substring(0, 2000));
      }
    } else if (providerState === "fail") {
      normalizedStatus = "failed";
      shouldStopPolling = true;
      errorMessage = taskData?.failMsg || taskData?.errorMessage || data?.msg || "La generación de video falló en el proveedor.";
    }

    return new Response(
      JSON.stringify({ taskId, status: normalizedStatus, providerState, videoUrl, error: errorMessage, shouldStopPolling }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("get-video-task error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || "Error desconocido.", status: "failed", shouldStopPolling: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
