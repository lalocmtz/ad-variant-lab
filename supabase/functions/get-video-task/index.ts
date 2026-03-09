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

    const response = await fetch(`https://api.kie.ai/api/v1/jobs/getTask?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Kie AI getTask error:", response.status, errText);
      return new Response(JSON.stringify({ error: `Error consultando estado del video (${response.status}).` }), {
        status: response.status >= 500 ? 502 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const taskData = data.data || data;

    // Normalize status
    const providerStatus = (taskData.status || "").toLowerCase();
    let normalizedStatus: string;
    let videoUrl: string | null = null;
    let errorMessage: string | null = null;
    let progress: number | null = null;

    if (providerStatus === "completed" || providerStatus === "success" || providerStatus === "done") {
      normalizedStatus = "completed";
      // Extract video URL from various possible response shapes
      videoUrl = taskData.output?.video_url
        || taskData.output?.url
        || taskData.video_url
        || taskData.result?.video_url
        || taskData.result?.url
        || (Array.isArray(taskData.output) ? taskData.output[0]?.url : null)
        || null;
    } else if (providerStatus === "failed" || providerStatus === "error") {
      normalizedStatus = "failed";
      errorMessage = taskData.error || taskData.message || "La generación de video falló.";
    } else if (providerStatus === "processing" || providerStatus === "running" || providerStatus === "in_progress") {
      normalizedStatus = "processing";
      progress = taskData.progress || null;
    } else if (providerStatus === "queued" || providerStatus === "pending" || providerStatus === "waiting") {
      normalizedStatus = "queued";
    } else {
      normalizedStatus = "processing"; // Default to processing for unknown states
    }

    return new Response(JSON.stringify({
      taskId,
      status: normalizedStatus,
      videoUrl,
      error: errorMessage,
      progress,
      providerStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("get-video-task error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Error desconocido." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
