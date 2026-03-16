import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Voice presets
const VOICE_MAP: Record<string, Record<string, string>> = {
  female: {
    natural: "EXAVITQu4vr4xnSDxMaL",    // Sarah
    energetic: "FGY2WhTYpPnrIDTdsKH5",   // Laura
    testimonial: "Xb7hH8MSUJpSbSDYk0k2",  // Alice
    trustworthy: "pFZP5JQG7iQjIQuC4Bku",  // Lily
  },
  male: {
    natural: "CwhRBWXzGAHq8TQ4Fs17",      // Roger
    energetic: "TX3LPaxmHKxFdv7VOQHJ",    // Liam
    testimonial: "onwK4e9ZLuTAKqWW03F9",  // Daniel
    trustworthy: "JBFqnCBsd6RMkjVDRZzb",  // George
  },
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, language, gender, tone, pace } = await req.json();
    if (!text || text.trim().length < 5) throw new Error("text is required");

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const g = gender || "female";
    const t = tone || "natural";
    const p = pace || "dynamic";

    const voiceId = VOICE_MAP[g]?.[t] || VOICE_MAP.female.natural;
    const speed = PACE_SPEED[p] || 1.1;
    const settings = TONE_SETTINGS[t] || TONE_SETTINGS.natural;

    console.log("AudioRoll TTS:", { textLength: text.length, gender: g, tone: t, pace: p, voiceId, speed });

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: settings.style,
            use_speaker_boost: true,
            speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs error:", response.status, errText);
      throw new Error(`TTS failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Upload to storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const fileName = `audioroll_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`;
    const { error: uploadErr } = await sb.storage.from("videos").upload(fileName, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = sb.storage.from("videos").getPublicUrl(fileName);

    console.log("AudioRoll voice uploaded:", urlData.publicUrl);

    return new Response(JSON.stringify({
      audio_url: urlData.publicUrl,
      voice_id: voiceId,
      gender: g,
      tone: t,
      pace: p,
      speed,
      duration_estimate_seconds: Math.ceil(text.length / 15), // rough estimate
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-audioroll-voice error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Voice generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
