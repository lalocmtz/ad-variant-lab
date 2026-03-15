// Types extracted from Index.tsx for reuse across components

export interface SceneGeometry {
  camera_distance: string;
  product_hand: string;
  product_position: string;
  camera_angle: string;
  lighting_direction: string;
}

export interface ActorVisualDirection {
  gender_presentation: string;
  approx_age_band: string;
  face_shape: string;
  hair_style: string;
  hair_color: string;
  skin_tone_range: string;
  overall_vibe: string;
  wardrobe: string;
}

export interface ScriptVariant {
  language: string;
  duration_target_seconds: number;
  hook: string;
  body: string;
  cta: string;
  full_script: string;
}

export interface HeygenReadyBrief {
  avatar_instruction?: string;
  delivery_style: string;
  pace: string;
  energy: string;
  facial_expression: string;
  gesture_style: string;
}

export interface SimilarityCheckResult {
  against_original: "pass" | "fail";
  cross_variant_diversity: "pass" | "fail";
  product_lock: "pass" | "fail";
  mechanics_preserved: "pass" | "fail";
  notes: string[];
}

export interface AnimationPromptPackage {
  variant_id: string;
  platform_target: string;
  prompt_text: string;
  prompt_json: Record<string, unknown>;
}

export interface WinnerBlueprint {
  duration_seconds: number;
  primary_hook_type: string;
  primary_hook_label?: string;
  primary_hook_visual: string;
  primary_hook_verbal: string;
  core_emotion: string;
  energy_profile: string;
  performance_style: string;
  performance_mechanics?: string[];
  cta_style: string;
  conversion_mechanics: string[];
  scene_type: string;
  camera_style: string;
  gesture_profile: string;
  guion_original_completo?: string;
  estructura_del_guion?: Record<string, string>;
  analisis_estructura_persuasiva?: { framework_detectado: string[]; explicacion_breve: string };
  triggers_psicologicos_detectados?: string[];
  actor_profile_observed: {
    gender_presentation: string;
    approx_age_band: string;
    creator_archetype: string;
    presence_style: string;
    market_context?: string;
    rol_del_creador?: string;
    perfil_de_confianza?: string;
  };
  scene_geometry: SceneGeometry;
  beat_timeline: Array<{
    start_sec: number;
    end_sec: number;
    beat_type: string;
    description: string;
  }>;
}

export type VariantStatus = "ready" | "needs_regeneration" | "approved" | "rejected" | "pending";

export type VideoGenerationStatus = "idle" | "queued" | "processing" | "completed" | "failed";

export interface VariantResult {
  variant_id: string;
  identity_distance: string;
  variant_summary: string;
  actor_archetype: string;
  identity_replacement_rules?: string[];
  image_generation_strategy?: string[];
  actor_visual_direction: ActorVisualDirection;
  script_variant: ScriptVariant;
  on_screen_text_plan?: Array<{ timestamp: string; text: string }>;
  shotlist?: Array<{ shot: number; duration: string; description: string }>;
  scene_geometry: SceneGeometry;
  base_image_prompt_9x16: string;
  heygen_ready_brief: HeygenReadyBrief;
  negative_prompt: string;
  similarity_check_result: SimilarityCheckResult;
  status: VariantStatus;
  generation_attempt: number;
  generated_image_url: string;
  animation_prompt_json?: Record<string, unknown>;
  prompt_package?: AnimationPromptPackage;
  video_task_id?: string;
  video_status?: VideoGenerationStatus;
  video_url?: string;
  video_error?: string;
  video_mode?: string;
}

export interface AnalysisResult {
  input_mode: string;
  has_voice: boolean;
  content_type: string;
  overlay_cleanup_required?: boolean;
  clean_frame_strategy?: string;
  winner_blueprint: WinnerBlueprint;
  variants: VariantResult[];
}

export type AppStep = "input" | "downloading" | "preview" | "classifying" | "mode_select" | "broll_config" | "broll_processing" | "broll_results" | "processing" | "results";
