import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * merge-audio: Takes a silent Kling video and the original TikTok video,
 * extracts audio from TikTok and merges it with the Kling video.
 * 
 * Uses raw MP4 container manipulation to copy the audio track
 * from the source into the destination without re-encoding.
 */

// MP4 Box reader utilities
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

interface Box {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
}

function parseBoxes(data: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end - 8) {
    let size = readUint32(data, offset);
    const type = readBoxType(data, offset + 4);
    let headerSize = 8;
    
    if (size === 0) break; // box extends to EOF — skip
    if (size === 1) {
      // 64-bit size — we'll skip these for simplicity
      break;
    }
    
    boxes.push({ type, offset, size, headerSize });
    offset += size;
  }
  return boxes;
}

function findBox(data: Uint8Array, start: number, end: number, type: string): Box | null {
  const boxes = parseBoxes(data, start, end);
  return boxes.find(b => b.type === type) || null;
}

function findAllBoxes(data: Uint8Array, start: number, end: number, type: string): Box[] {
  const boxes = parseBoxes(data, start, end);
  return boxes.filter(b => b.type === type);
}

/**
 * Extract the 'trak' box that contains an audio track (identified by 'soun' handler in hdlr).
 */
function findAudioTrak(data: Uint8Array, moovBox: Box): Uint8Array | null {
  const moovStart = moovBox.offset + moovBox.headerSize;
  const moovEnd = moovBox.offset + moovBox.size;
  const traks = findAllBoxes(data, moovStart, moovEnd, "trak");
  
  for (const trak of traks) {
    const trakData = data.slice(trak.offset, trak.offset + trak.size);
    // Search for 'soun' handler type in hdlr box
    const trakStr = new TextDecoder("ascii").decode(trakData);
    if (trakStr.includes("soun")) {
      return trakData;
    }
  }
  return null;
}

/**
 * Find the video trak box
 */
function findVideoTrak(data: Uint8Array, moovBox: Box): Uint8Array | null {
  const moovStart = moovBox.offset + moovBox.headerSize;
  const moovEnd = moovBox.offset + moovBox.size;
  const traks = findAllBoxes(data, moovStart, moovEnd, "trak");
  
  for (const trak of traks) {
    const trakData = data.slice(trak.offset, trak.offset + trak.size);
    const trakStr = new TextDecoder("ascii").decode(trakData);
    if (trakStr.includes("vide")) {
      return trakData;
    }
  }
  return null;
}

/**
 * Simple approach: Instead of complex MP4 atom manipulation,
 * we'll use a streaming approach where we reconstruct the MP4
 * by taking the video track from Kling and audio track from TikTok.
 * 
 * Since proper MP4 remuxing is very complex (sample table offsets, etc.),
 * we take a simpler approach: use the Kling video as base and inject
 * the audio mdat + track into it.
 * 
 * Actually, the SIMPLEST reliable approach: just return both URLs
 * and let the frontend <video> element handle it. But that won't work
 * for download.
 * 
 * PRACTICAL APPROACH: We'll proxy through an ffmpeg API service,
 * or we use the fact that we can modify the Kling moov to add an audio trak.
 */

/**
 * Rebuild an MP4 by combining the video track from one file
 * with the audio track from another. This is a simplified remuxer
 * that works for the common case of H.264 video + AAC audio.
 * 
 * Strategy:
 * 1. Parse source (TikTok) to get audio trak + its mdat samples
 * 2. Parse dest (Kling) to get video trak + its mdat
 * 3. Build new MP4: ftyp + moov(video_trak + audio_trak) + mdat(combined)
 * 4. Adjust chunk offsets (stco/co64) in both traks
 */
function mergeVideoAndAudio(videoMp4: Uint8Array, audioMp4: Uint8Array): Uint8Array {
  // Find key boxes in video file (Kling - has video, no audio)
  const vFtyp = findBox(videoMp4, 0, videoMp4.length, "ftyp");
  const vMoov = findBox(videoMp4, 0, videoMp4.length, "moov");
  const vMdat = findBox(videoMp4, 0, videoMp4.length, "mdat");
  
  if (!vFtyp || !vMoov || !vMdat) {
    throw new Error("Video file missing ftyp/moov/mdat boxes");
  }
  
  // Find key boxes in audio source (TikTok - has audio)
  const aMoov = findBox(audioMp4, 0, audioMp4.length, "moov");
  const aMdat = findBox(audioMp4, 0, audioMp4.length, "mdat");
  
  if (!aMoov || !aMdat) {
    throw new Error("Audio source file missing moov/mdat boxes");
  }
  
  // Extract traks
  const videoTrak = findVideoTrak(videoMp4, vMoov);
  const audioTrak = findAudioTrak(audioMp4, aMoov);
  
  if (!videoTrak) throw new Error("No video track found in Kling output");
  if (!audioTrak) throw new Error("No audio track found in TikTok source");
  
  // Get other moov children (mvhd, etc.) from video file
  const moovStart = vMoov.offset + vMoov.headerSize;
  const moovEnd = vMoov.offset + vMoov.size;
  const moovChildren = parseBoxes(videoMp4, moovStart, moovEnd);
  
  // Collect non-trak moov children (mvhd, udta, etc.)
  const otherBoxes: Uint8Array[] = [];
  for (const child of moovChildren) {
    if (child.type !== "trak") {
      otherBoxes.push(videoMp4.slice(child.offset, child.offset + child.size));
    }
  }
  
  // Build ftyp
  const ftypData = videoMp4.slice(vFtyp.offset, vFtyp.offset + vFtyp.size);
  
  // Video mdat data  
  const videoMdatData = videoMp4.slice(vMdat.offset + vMdat.headerSize, vMdat.offset + vMdat.size);
  // Audio mdat data
  const audioMdatData = audioMp4.slice(aMdat.offset + aMdat.headerSize, aMdat.offset + aMdat.size);
  
  // Combined mdat: video data first, then audio data
  const combinedMdatSize = 8 + videoMdatData.length + audioMdatData.length;
  const combinedMdat = new Uint8Array(combinedMdatSize);
  writeUint32(combinedMdat, 0, combinedMdatSize);
  combinedMdat[4] = 0x6d; // m
  combinedMdat[5] = 0x64; // d
  combinedMdat[6] = 0x61; // a
  combinedMdat[7] = 0x74; // t
  combinedMdat.set(videoMdatData, 8);
  combinedMdat.set(audioMdatData, 8 + videoMdatData.length);
  
  // Build moov: other boxes + video trak + audio trak (with adjusted offsets)
  let moovContentSize = 0;
  for (const box of otherBoxes) moovContentSize += box.length;
  moovContentSize += videoTrak.length;
  moovContentSize += audioTrak.length;
  const moovSize = 8 + moovContentSize;
  
  // Calculate where mdat starts in the final file
  const mdatOffset = ftypData.length + moovSize;
  
  // Adjust video trak stco offsets
  // Video data starts at mdatOffset + 8 (mdat header)
  const adjustedVideoTrak = new Uint8Array(videoTrak);
  adjustChunkOffsets(adjustedVideoTrak, mdatOffset + 8, vMdat.offset + vMdat.headerSize);
  
  // Adjust audio trak stco offsets  
  // Audio data starts at mdatOffset + 8 + videoMdatData.length
  const adjustedAudioTrak = new Uint8Array(audioTrak);
  adjustChunkOffsets(adjustedAudioTrak, mdatOffset + 8 + videoMdatData.length, aMdat.offset + aMdat.headerSize);
  
  // Build moov box
  const moov = new Uint8Array(moovSize);
  writeUint32(moov, 0, moovSize);
  moov[4] = 0x6d; // m
  moov[5] = 0x6f; // o
  moov[6] = 0x6f; // o
  moov[7] = 0x76; // v
  
  let pos = 8;
  for (const box of otherBoxes) {
    moov.set(box, pos);
    pos += box.length;
  }
  moov.set(adjustedVideoTrak, pos);
  pos += adjustedVideoTrak.length;
  moov.set(adjustedAudioTrak, pos);
  
  // Combine everything
  const result = new Uint8Array(ftypData.length + moovSize + combinedMdatSize);
  result.set(ftypData, 0);
  result.set(moov, ftypData.length);
  result.set(combinedMdat, ftypData.length + moovSize);
  
  return result;
}

/**
 * Adjust stco (Sample Table Chunk Offset) entries in a trak box.
 * newBase: where this trak's mdat data starts in the new file
 * oldBase: where this trak's mdat data started in the original file
 */
function adjustChunkOffsets(trakData: Uint8Array, newBase: number, oldBase: number) {
  // Find stco box within the trak
  const delta = newBase - oldBase;
  
  // Search for 'stco' in the trak data
  for (let i = 0; i < trakData.length - 8; i++) {
    if (trakData[i] === 0x73 && trakData[i+1] === 0x74 && 
        trakData[i+2] === 0x63 && trakData[i+3] === 0x6f) {
      // Found 'stco' type at position i (this is byte 4-7 of the box header)
      // Box starts at i-4
      const boxStart = i - 4;
      const boxSize = readUint32(trakData, boxStart);
      
      // stco format: size(4) + type(4) + version(1) + flags(3) + entry_count(4) + entries(4 each)
      const entryCount = readUint32(trakData, boxStart + 12);
      
      for (let e = 0; e < entryCount; e++) {
        const entryOffset = boxStart + 16 + e * 4;
        if (entryOffset + 4 > trakData.length) break;
        const oldOffset = readUint32(trakData, entryOffset);
        writeUint32(trakData, entryOffset, oldOffset + delta);
      }
    }
    
    // Also handle co64 (64-bit chunk offsets) - skip for now as most files use stco
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { kling_video_url, original_video_url } = await req.json();

    if (!kling_video_url || !original_video_url) {
      return new Response(
        JSON.stringify({ error: "kling_video_url and original_video_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Downloading Kling video:", kling_video_url);
    console.log("Downloading original video:", original_video_url);

    // Download both videos in parallel
    const [klingRes, originalRes] = await Promise.all([
      fetch(kling_video_url),
      fetch(original_video_url),
    ]);

    if (!klingRes.ok) throw new Error(`Failed to download Kling video: ${klingRes.status}`);
    if (!originalRes.ok) throw new Error(`Failed to download original video: ${originalRes.status}`);

    const klingBuffer = new Uint8Array(await klingRes.arrayBuffer());
    const originalBuffer = new Uint8Array(await originalRes.arrayBuffer());

    console.log(`Kling video size: ${klingBuffer.length}, Original size: ${originalBuffer.length}`);

    // Check if original has audio track
    const origMoov = findBox(originalBuffer, 0, originalBuffer.length, "moov");
    if (!origMoov) {
      // No moov in original — just return Kling video as-is
      console.log("Original video has no moov box, returning Kling video as-is");
      return new Response(
        JSON.stringify({ merged_url: kling_video_url, had_audio: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioTrak = findAudioTrak(originalBuffer, origMoov);
    if (!audioTrak) {
      console.log("Original video has no audio track, returning Kling video as-is");
      return new Response(
        JSON.stringify({ merged_url: kling_video_url, had_audio: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge video + audio
    console.log("Merging audio from original into Kling video...");
    const merged = mergeVideoAndAudio(klingBuffer, originalBuffer);
    console.log(`Merged file size: ${merged.length}`);

    // Upload to Supabase storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `merged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, merged, { contentType: "video/mp4", upsert: false });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);
    const mergedUrl = urlData.publicUrl;

    console.log("Merged video uploaded:", mergedUrl);

    return new Response(
      JSON.stringify({ merged_url: mergedUrl, had_audio: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("merge-audio error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
