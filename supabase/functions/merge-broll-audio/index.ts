import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// MP4 box utilities (same as merge-audio)
function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint32(data: Uint8Array, offset: number, value: number) {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function readBoxType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

interface Box { type: string; offset: number; size: number; headerSize: number; }

function parseBoxes(data: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end - 8) {
    const size = readUint32(data, offset);
    const type = readBoxType(data, offset + 4);
    if (size === 0 || size === 1) break;
    boxes.push({ type, offset, size, headerSize: 8 });
    offset += size;
  }
  return boxes;
}

function findBox(data: Uint8Array, start: number, end: number, type: string): Box | null {
  return parseBoxes(data, start, end).find(b => b.type === type) || null;
}

function findAllBoxes(data: Uint8Array, start: number, end: number, type: string): Box[] {
  return parseBoxes(data, start, end).filter(b => b.type === type);
}

function findVideoTrak(data: Uint8Array, moovBox: Box): Uint8Array | null {
  const traks = findAllBoxes(data, moovBox.offset + moovBox.headerSize, moovBox.offset + moovBox.size, "trak");
  for (const trak of traks) {
    const trakData = data.slice(trak.offset, trak.offset + trak.size);
    if (new TextDecoder("ascii").decode(trakData).includes("vide")) return trakData;
  }
  return null;
}

function findAudioTrak(data: Uint8Array, moovBox: Box): Uint8Array | null {
  const traks = findAllBoxes(data, moovBox.offset + moovBox.headerSize, moovBox.offset + moovBox.size, "trak");
  for (const trak of traks) {
    const trakData = data.slice(trak.offset, trak.offset + trak.size);
    if (new TextDecoder("ascii").decode(trakData).includes("soun")) return trakData;
  }
  return null;
}

function adjustChunkOffsets(trakData: Uint8Array, newBase: number, oldBase: number) {
  const delta = newBase - oldBase;
  for (let i = 0; i < trakData.length - 8; i++) {
    if (trakData[i] === 0x73 && trakData[i+1] === 0x74 && trakData[i+2] === 0x63 && trakData[i+3] === 0x6f) {
      const boxStart = i - 4;
      const entryCount = readUint32(trakData, boxStart + 12);
      for (let e = 0; e < entryCount; e++) {
        const entryOffset = boxStart + 16 + e * 4;
        if (entryOffset + 4 > trakData.length) break;
        writeUint32(trakData, entryOffset, readUint32(trakData, entryOffset) + delta);
      }
    }
  }
}

/**
 * Strip audio from the original video and replace with TTS audio.
 * Strategy: Take video track from original, discard original audio,
 * then the TTS MP3 is returned separately for the frontend to handle.
 * 
 * For V1: We return the original video URL (which already has its own audio/music)
 * along with the TTS audio URL, and let the frontend layer them.
 * A proper merge would require ffmpeg which isn't available in edge functions.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_url, audio_base64, variant_id } = await req.json();

    if (!video_url) throw new Error("video_url is required");
    if (!audio_base64) throw new Error("audio_base64 is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload the TTS audio to storage
    const audioBytes = Uint8Array.from(atob(audio_base64), c => c.charCodeAt(0));
    const audioFileName = `broll_voice_${variant_id || Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`;

    const { error: audioUploadError } = await supabase.storage
      .from("videos")
      .upload(audioFileName, audioBytes, { contentType: "audio/mpeg", upsert: false });

    if (audioUploadError) throw new Error(`Audio upload failed: ${audioUploadError.message}`);

    const { data: audioUrlData } = supabase.storage.from("videos").getPublicUrl(audioFileName);

    console.log("B-roll audio uploaded:", audioUrlData.publicUrl);

    // For V1, return video + audio URLs separately
    // The frontend will combine them in playback
    return new Response(JSON.stringify({
      video_url,
      audio_url: audioUrlData.publicUrl,
      variant_id,
      merge_strategy: "dual_track",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("merge-broll-audio error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Merge failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
