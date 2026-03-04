import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Voice selection based on content_type, has_voice, and suggested_voice_gender
function selectVoiceId(hasVoice: boolean, contentType: string, gender?: string): string | null {
  if (!hasVoice) return null; // Silent mode

  // Female voices
  const femaleVoices = {
    conversational: "EXAVITQu4vr4xnSDxMaL", // Sarah
    explanatory: "FGY2WhTYpPnrIDTdsKH5",    // Laura
  };
  // Male voices
  const maleVoices = {
    conversational: "CwhRBWXzGAHq8TQ4Fs17", // Roger
    explanatory: "nPczCjzI2devNBz1zQrb",    // Brian
  };

  const isFemale = gender?.toLowerCase() === "female";
  const voices = isFemale ? femaleVoices : maleVoices;

  if (contentType === "HUMAN_TALKING") return voices.conversational;
  if (contentType === "HANDS_DEMO") return voices.explanatory;
  return voices.conversational; // default
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { script, has_voice, content_type, suggested_voice_gender, variant_id } = await req.json();
    if (!script) throw new Error("script is required");

    // If no voice detected, skip TTS
    if (!has_voice) {
      return new Response(JSON.stringify({ audio_url: null, skipped: true, reason: "no_voice" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const voiceId = selectVoiceId(has_voice, content_type, suggested_voice_gender);
    if (!voiceId) {
      return new Response(JSON.stringify({ audio_url: null, skipped: true, reason: "no_voice_selected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Combine script parts into full text
    const fullText = [script.hook, script.body, script.cta].filter(Boolean).join(". ");

    console.log("Generating voiceover:", { voiceId, textLength: fullText.length, contentType: content_type, gender: suggested_voice_gender });

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: fullText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs error:", response.status, errText);
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Upload audio to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `voiceover_${variant_id || "x"}_${Date.now()}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Error uploading audio to storage");
    }

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(fileName);

    return new Response(JSON.stringify({ audio_url: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-voiceover error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
