export type PromptModule = "video_variants" | "prompt_lab" | "ugc_arcade" | "bof" | "broll_lab_2";

export type PromptStage =
  | "analysis_prompt"
  | "script_prompt"
  | "image_prompt"
  | "motion_prompt"
  | "provider_video_prompt"
  | "breakdown_prompt"
  | "scene_extraction_prompt"
  | "master_recreation_prompt"
  | "instruction_to_script_prompt"
  | "script_to_shotlist_prompt"
  | "shotlist_to_video_prompt";

export interface GenerationPrompt {
  id: string;
  jobId: string;
  module: PromptModule;
  stage: PromptStage;
  provider?: string | null;
  defaultPrompt: string;
  editedPrompt?: string | null;
  effectivePrompt: string;
  variables?: Record<string, unknown>;
  isUserModified: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export const STAGE_LABELS: Record<PromptStage, string> = {
  analysis_prompt: "Análisis de Video",
  script_prompt: "Generación de Guión",
  image_prompt: "Generación de Imagen",
  motion_prompt: "Motion / Animación",
  provider_video_prompt: "Prompt de Video (Provider)",
  breakdown_prompt: "Breakdown de Video",
  scene_extraction_prompt: "Extracción de Escenas",
  master_recreation_prompt: "Recreación Master",
  instruction_to_script_prompt: "Instrucción → Guión",
  script_to_shotlist_prompt: "Guión → Shotlist",
  shotlist_to_video_prompt: "Shotlist → Video",
};
