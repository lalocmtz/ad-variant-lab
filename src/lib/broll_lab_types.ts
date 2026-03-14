// Types for BROLL VARIANTS LAB — fully isolated module

export interface BrollLabInputs {
  tiktokUrl1: string;
  tiktokUrl2: string;
  tiktokUrl3: string;
  productImageUrl: string;
  productUrl: string;
  language: string;
  accent: string;
  voiceTone: string;
  voiceVariantCount: number;
}

export interface TikTokDownloadResult {
  video_url: string;
  cover_url: string;
  metadata: {
    title: string;
    duration: number;
    author: string;
  };
}

export interface ScenePrompt {
  scene_index: number;
  label: string;
  image_prompt: string;
  motion_prompt: string;
}

export interface VoiceScript {
  variant_index: number;
  hook: string;
  body: string;
  cta: string;
  full_text: string;
  tone: string;
}

export interface BrollLabAnalysis {
  product_detected: string;
  key_benefits: string[];
  common_hooks: string[];
  common_ctas: string[];
  visual_patterns: string[];
  human_actions?: string;
  camera_behavior?: string;
  environment_context?: string;
  product_interactions?: string;
  ugc_authenticity_signals?: string;
  scene_structure?: string;
  rhythm_analysis?: string;
  reference_transcripts?: string[];
  ad_structure: string;
  scenes: ScenePrompt[];
  voice_scripts: VoiceScript[];
  summary_es: string;
}

export interface SceneResult {
  scene_index: number;
  image_url: string;
  video_task_id?: string;
  video_url?: string;
  status: "pending" | "generating_image" | "animating" | "polling" | "done" | "error";
  error?: string;
}

export interface VoiceVariant {
  variant_index: number;
  script: VoiceScript;
  audio_url?: string;
  final_video_url?: string;
  status: "pending" | "generating_voice" | "merging" | "done" | "error";
  error?: string;
}

export type PipelineStep =
  | "idle"
  | "downloading"
  | "analyzing"
  | "generating_images"
  | "awaiting_approval"
  | "animating"
  | "stitching"
  | "generating_voices"
  | "merging"
  | "done"
  | "error";

export interface BrollLabState {
  step: PipelineStep;
  stepMessage: string;
  analysis: BrollLabAnalysis | null;
  scenes: SceneResult[];
  approvedScenes: boolean[];
  voiceVariants: VoiceVariant[];
  masterVideoUrls: string[];
  error: string | null;
  historyId: string | null;
}
