import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ──

interface VideoGenInput {
  job_id: string;
  module: string;
  stage: string;
  effective_prompt: string;
  image_url?: string | null;
  reference_video_url?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  mode?: string | null;
  preferred_provider?: string | null;
  provider_order?: string[];
  metadata?: Record<string, unknown> | null;
  language?: string;
  accent?: string;
  user_id?: string;
}

interface ProviderResult {
  status: "success" | "queued" | "failed";
  provider: string;
  taskId?: string | null;
  videoUrl?: string | null;
  raw?: Record<string, unknown> | null;
  message?: string | null;
}

interface FallbackEntry {
  provider: string;
  status: string;
  message: string | null;
  timestamp: string;
}

// ── Helpers ──

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

async function logToDb(
  supabase: any,
  params: {
    job_id: string;
    user_id?: string;
    module: string;
    stage: string;
    provider?: string;
    status: string;
    message?: string;
    raw_error?: string;
    request_payload_json?: Record<string, unknown>;
    response_payload_json?: Record<string, unknown>;
    prompt_text?: string;
  }
) {
  if (!supabase) return;
  try {
    await supabase.from("generation_logs").insert([{
      job_id: params.job_id,
      user_id: params.user_id || null,
      module: params.module,
      stage: params.stage,
      provider: params.provider || null,
      status: params.status,
      message: params.message || null,
      raw_error: params.raw_error || null,
      request_payload_json: params.request_payload_json || null,
      response_payload_json: params.response_payload_json || null,
      prompt_text: params.prompt_text || null,
    }]);
  } catch (e) {
    console.warn("[orchestrator] Failed to write log:", e);
  }
}

// ── Prompt builder (same as generate-video-sora) ──

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
    sanitized = sanitized.substring(0, maxBase);
  }
  return sanitized + suffix;
}

// ── Provider Adapters ──

async function trySora(input: VideoGenInput, finalPrompt: string): Promise<ProviderResult> {
  const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
  if (!KIE_API_KEY) return { status: "failed", provider: "sora", message: "KIE_API_KEY not configured" };

  const requestBody = {
    model: "sora-2-image-to-video",
    input: {
      prompt: finalPrompt,
      image_urls: [input.image_url],
      aspect_ratio: "portrait",
      n_frames: "10",
      remove_watermark: true,
    },
  };

  try {
    const response = await fetchWithTimeout(
      "https://api.kie.ai/api/v1/jobs/createTask",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
      30000,
    );

    const text = await response.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch {
      return { status: "failed", provider: "sora", message: "Non-JSON response from KIE", raw: { text: text.substring(0, 500) } };
    }

    if (!response.ok) {
      const statusErrors: Record<number, string> = { 401: "Auth failed", 402: "Insufficient credits", 422: "Invalid params", 429: "Rate limited" };
      return { status: "failed", provider: "sora", message: statusErrors[response.status] || `HTTP ${response.status}`, raw: data };
    }

    const kieCode = (data as any)?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      return { status: "failed", provider: "sora", message: (data as any)?.msg || `code ${kieCode}`, raw: data };
    }

    const taskId = extractTaskId(data);
    if (!taskId) return { status: "failed", provider: "sora", message: "No taskId returned", raw: data };

    return { status: "queued", provider: "sora", taskId, raw: data };
  } catch (e: any) {
    return { status: "failed", provider: "sora", message: e?.name === "AbortError" ? "Timeout 30s" : e?.message };
  }
}

async function tryFal(input: VideoGenInput, finalPrompt: string): Promise<ProviderResult> {
  const FAL_API_KEY = Deno.env.get("FAL_API_KEY");
  if (!FAL_API_KEY) return { status: "failed", provider: "fal", message: "FAL_API_KEY not configured" };

  const requestBody = {
    prompt: finalPrompt,
    image_url: input.image_url,
    aspect_ratio: "9:16",
    duration: "short",
  };

  try {
    const response = await fetchWithTimeout(
      "https://queue.fal.run/fal-ai/sora-2/image-to-video",
      {
        method: "POST",
        headers: { Authorization: `Key ${FAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
      30000,
    );

    const text = await response.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch {
      return { status: "failed", provider: "fal", message: "Non-JSON response", raw: { text: text.substring(0, 500) } };
    }

    if (!response.ok) {
      return { status: "failed", provider: "fal", message: `HTTP ${response.status}: ${(data as any)?.detail || (data as any)?.message || ""}`, raw: data };
    }

    const requestId = (data as any)?.request_id;
    if (!requestId) return { status: "failed", provider: "fal", message: "No request_id returned", raw: data };

    // Prefix with "fal:" so polling knows which provider to query
    return { status: "queued", provider: "fal", taskId: `fal:${requestId}`, raw: data };
  } catch (e: any) {
    return { status: "failed", provider: "fal", message: e?.name === "AbortError" ? "Timeout 30s" : e?.message };
  }
}

async function tryKling(input: VideoGenInput, finalPrompt: string): Promise<ProviderResult> {
  const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
  if (!KIE_API_KEY) return { status: "failed", provider: "kling", message: "KIE_API_KEY not configured" };

  const requestBody = {
    model: "sora-2-pro-image-to-video",
    input: {
      prompt: finalPrompt,
      image_urls: [input.image_url],
      aspect_ratio: "portrait",
      n_frames: "10",
      size: "standard",
      remove_watermark: true,
    },
  };

  try {
    const response = await fetchWithTimeout(
      "https://api.kie.ai/api/v1/jobs/createTask",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
      30000,
    );

    const text = await response.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch {
      return { status: "failed", provider: "kling", message: "Non-JSON response", raw: { text: text.substring(0, 500) } };
    }

    if (!response.ok) {
      return { status: "failed", provider: "kling", message: `HTTP ${response.status}`, raw: data };
    }

    const kieCode = (data as any)?.code;
    if (kieCode !== undefined && kieCode !== 200) {
      return { status: "failed", provider: "kling", message: (data as any)?.msg || `code ${kieCode}`, raw: data };
    }

    const taskId = extractTaskId(data);
    if (!taskId) return { status: "failed", provider: "kling", message: "No taskId returned", raw: data };

    return { status: "queued", provider: "kling", taskId, raw: data };
  } catch (e: any) {
    return { status: "failed", provider: "kling", message: e?.name === "AbortError" ? "Timeout 30s" : e?.message };
  }
}

const PROVIDER_MAP: Record<string, (input: VideoGenInput, prompt: string) => Promise<ProviderResult>> = {
  sora: trySora,
  fal: tryFal,
  kling: tryKling,
};

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseAdmin();

  try {
    const input: VideoGenInput = await req.json();

    console.log("[orchestrator] Request:", JSON.stringify({
      job_id: input.job_id,
      module: input.module,
      stage: input.stage,
      promptLength: input.effective_prompt?.length,
      image_url: input.image_url?.substring(0, 80),
      preferred_provider: input.preferred_provider,
      provider_order: input.provider_order,
    }));

    // Validation
    if (!input.job_id) return jsonResponse({ ok: false, error: "job_id required" }, 400);
    if (!input.effective_prompt || input.effective_prompt.trim().length < 20)
      return jsonResponse({ ok: false, error: "effective_prompt required (min 20 chars)" }, 400);
    if (!input.image_url) return jsonResponse({ ok: false, error: "image_url required" }, 400);

    const language = input.language || "es-MX";
    const accent = input.accent || "mexicano";
    const finalPrompt = buildVideoPrompt(input.effective_prompt, language, accent);

    const providerOrder = input.provider_order || ["sora", "fal", "kling"];

    // If preferred_provider is set, put it first
    if (input.preferred_provider && PROVIDER_MAP[input.preferred_provider]) {
      const idx = providerOrder.indexOf(input.preferred_provider);
      if (idx > 0) {
        providerOrder.splice(idx, 1);
        providerOrder.unshift(input.preferred_provider);
      }
    }

    await logToDb(supabase, {
      job_id: input.job_id, user_id: input.user_id, module: input.module,
      stage: input.stage, status: "started",
      message: `Orchestrator started. Order: ${providerOrder.join(" → ")}`,
      prompt_text: input.effective_prompt.substring(0, 2000),
    });

    const fallbackChain: FallbackEntry[] = [];

    for (let i = 0; i < providerOrder.length; i++) {
      const providerName = providerOrder[i];
      const adapterFn = PROVIDER_MAP[providerName];
      if (!adapterFn) {
        fallbackChain.push({ provider: providerName, status: "skipped", message: "Unknown provider", timestamp: new Date().toISOString() });
        continue;
      }

      console.log(`[orchestrator] Trying provider ${i + 1}/${providerOrder.length}: ${providerName}`);

      await logToDb(supabase, {
        job_id: input.job_id, user_id: input.user_id, module: input.module,
        stage: input.stage, provider: providerName, status: "trying",
        message: `Attempting provider: ${providerName}`,
      });

      const result = await adapterFn(input, finalPrompt);

      if (result.status === "queued" || result.status === "success") {
        await logToDb(supabase, {
          job_id: input.job_id, user_id: input.user_id, module: input.module,
          stage: input.stage, provider: providerName, status: result.status,
          message: `Provider ${providerName} accepted. TaskId: ${result.taskId}`,
          response_payload_json: result.raw as Record<string, unknown> || undefined,
        });

        fallbackChain.push({ provider: providerName, status: result.status, message: null, timestamp: new Date().toISOString() });

        return jsonResponse({
          ok: true,
          status: result.status,
          provider_used: providerName,
          fallback_chain: fallbackChain,
          fallback_count: i,
          taskId: result.taskId,
          video_url: result.videoUrl || null,
          engine: providerName,
          modelLabel: providerName === "sora" ? "Sora 2" : providerName === "fal" ? "fal.ai Sora 2" : "Kling Pro",
          fallbackUsed: i > 0,
          spec: { aspect_ratio: "9:16", duration_seconds: 9, audio_expected: false },
        });
      }

      // Failed — log and continue
      console.warn(`[orchestrator] Provider ${providerName} failed: ${result.message}`);
      await logToDb(supabase, {
        job_id: input.job_id, user_id: input.user_id, module: input.module,
        stage: input.stage, provider: providerName, status: "failed",
        message: result.message || "Unknown failure",
        raw_error: JSON.stringify(result.raw || {}).substring(0, 5000),
        response_payload_json: result.raw as Record<string, unknown> || undefined,
      });

      fallbackChain.push({
        provider: providerName, status: "failed",
        message: result.message || "Unknown failure",
        timestamp: new Date().toISOString(),
      });
    }

    // All providers failed
    await logToDb(supabase, {
      job_id: input.job_id, user_id: input.user_id, module: input.module,
      stage: input.stage, status: "all_failed",
      message: `All providers failed: ${providerOrder.join(", ")}`,
    });

    return jsonResponse({
      ok: false,
      status: "failed",
      provider_used: null,
      fallback_chain: fallbackChain,
      fallback_count: providerOrder.length,
      taskId: null,
      video_url: null,
      error: `Todos los proveedores fallaron: ${fallbackChain.map(f => `${f.provider}: ${f.message}`).join(" | ")}`,
    });

  } catch (e: any) {
    console.error("[orchestrator] Unhandled error:", e);
    return jsonResponse({ ok: false, error: e?.message || "Unknown error", status: "failed" }, 500);
  }
});
