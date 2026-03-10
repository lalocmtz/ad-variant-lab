export type BofBatchStatus = "pending" | "generating_scripts" | "generating_images" | "generating_videos" | "generating_voice" | "merging" | "completed" | "failed";
export type BofVariantStatus = "pending" | "script_ready" | "image_ready" | "video_ready" | "voice_ready" | "completed" | "failed";

export interface BofFormData {
  product_name: string;
  product_image: File | null;
  current_price: string;
  old_price: string;
  main_benefit: string;
  offer: string;
  pain_point: string;
  audience: string;
  variants_count: number;
  selected_formats: string[];
  language: string;
  accent: string;
}

export interface BofPayload {
  product_name: string;
  product_image_url: string;
  current_price: string;
  old_price: string;
  main_benefit: string;
  offer: string;
  pain_point: string;
  audience: string;
  variants_count: number;
  selected_formats: string[];
  language: string;
  accent: string;
}

export interface BofVariantResult {
  id: string;
  batch_id: string;
  format_id: string;
  format_name: string;
  script_text: string;
  visual_prompt: string;
  generated_image_url: string;
  raw_video_url: string;
  voice_audio_url: string;
  final_video_url: string;
  status: BofVariantStatus;
  error_message: string;
}

export interface BofBatchResult {
  id: string;
  product_name: string;
  product_image_url: string;
  status: BofBatchStatus;
  variants: BofVariantResult[];
}

export interface BofAutofillConfidence {
  product_name: number;
  current_price: number;
  old_price: number;
  main_benefit: number;
  offer: number;
  pain_point: number;
  audience: number;
}

export interface BofAutofillResult {
  product_name: string;
  current_price: string;
  old_price: string;
  main_benefit: string;
  offer: string;
  pain_point: string;
  audience: string;
  suggested_formats: string[];
  language: string;
  accent: string;
  confidence: Partial<BofAutofillConfidence>;
  product_image_file?: File;
}
