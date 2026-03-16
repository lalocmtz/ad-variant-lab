import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PACE_SPEED: Record<string, number> = {
  normal: 1.0,
  dynamic: 1.1,
  fast: 1.2,
};

const TONE_SETTINGS: Record<string, { stability: number; style: number; similarity_boost: number }> = {
  natural: { stability: 0.4, style: 0.3, similarity_boost: 0.75 },
  energetic: { stability: 0.3, style: 0.5, similarity_boost: 0.7 },
  testimonial: { stability: 0.5, style: 0.4, similarity_boost: 0.8 },
  trustworthy: { stability: 0.6, style: 0.3, similarity_boost: 0.8 },
};

// Fallback voices when no custom voice_id provided
const DEFAULT_VOICES: Record<string, string> = {
  female: "EXAVITQu4vr4xnSDxMaL", // Sarah
  male: "CwhRBWXzGAHq8TQ4Fs17",   // Roger
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { text, voice_id, gender, tone, pace, stability, similarity_boost, style: styleOverride } = body;

    if (!text || text.trim().length < 3) throw new Error("text is required");

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    // Use custom voice_id if provided, otherwise fallback to gender default
    const finalVoiceId = voice_id?.trim() || DEFAULT_VOICES[gender || "female"];
    if (!finalVoiceId) throw new Error("voice_id is required");

    const t = tone || "natural";
    const p = pace || "dynamic";
    const speed = PACE_SPEED[p] || 1.1;
    const defaults = TONE_SETTINGS[t] || TONE_SETTINGS.natural;

    const voiceSettings = {
      stability: stability ?? defaults.stability,
      similarity_boost: similarity_boost ?? defaults.similarity_boost,
      style: styleOverride ?? defaults.style,
      use_speaker_boost: true,
      speed,
    };

    console.log("ScriptRoll TTS:", { textLen: text.length, voiceId: finalVoiceId, tone: t, pace: p, speed });

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs error:", response.status, errText);
      throw new Error(`TTS failed (${response.status}): ${errText.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Upload to storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const fileName = `scriptroll_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`;
    const { error: uploadErr } = await sb.storage.from("videos").upload(fileName, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = sb.storage.from("videos").getPublicUrl(fileName);

    console.log("ScriptRoll voice uploaded:", urlData.publicUrl);

    return new Response(JSON.stringify({
      audio_url: urlData.publicUrl,
      audio_storage_path: fileName,
      voice_id_used: finalVoiceId,
      settings_used: { tone: t, pace: p, speed, ...voiceSettings },
      duration_estimate_seconds: Math.ceil(text.length / 15),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-scriptroll-voice error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Voice generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
