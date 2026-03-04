import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task_id } = await req.json();
    if (!task_id) throw new Error("task_id is required");

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");

    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(task_id)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Task check error:", response.status, errText);
      throw new Error(`Task check error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Task status:", JSON.stringify(data).substring(0, 500));

    // Determine status
    const taskStatus = data.data?.status || data.data?.taskStatus || "unknown";
    const isCompleted = taskStatus === "completed" || taskStatus === "SUCCESS" || taskStatus === "success";
    const isFailed = taskStatus === "failed" || taskStatus === "FAILED" || taskStatus === "error";
    const isProcessing = !isCompleted && !isFailed;

    // Extract video URL from completed task
    let videoUrl = null;
    if (isCompleted) {
      videoUrl = data.data?.output?.video_url 
        || data.data?.output?.videoUrl 
        || data.data?.videoUrl 
        || data.data?.output?.url
        || data.data?.result?.url
        || null;
    }

    return new Response(JSON.stringify({
      status: isCompleted ? "completed" : isFailed ? "failed" : "processing",
      video_url: videoUrl,
      raw_status: taskStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-animation-task error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
