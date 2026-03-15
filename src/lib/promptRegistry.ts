import type { PromptModule, PromptStage, GenerationPrompt } from "./promptTypes";
import { loadDraft } from "./promptDraftStore";

// ── Template factories ──

function imagePromptDefault(vars: Record<string, unknown>): string {
  return (vars.base_image_prompt as string) || "";
}

function motionPromptDefault(vars: Record<string, unknown>): string {
  return (vars.prompt_text as string) || "";
}

function providerVideoPromptDefault(vars: Record<string, unknown>): string {
  return (vars.prompt_text as string) || "";
}

// Placeholder templates for future modules
function analysisPromptDefault(): string {
  return "[Prompt de análisis generado automáticamente por el backend]";
}

function scriptPromptDefault(): string {
  return "[Prompt de guión generado automáticamente por el backend]";
}

const TEMPLATE_MAP: Record<string, (vars: Record<string, unknown>) => string> = {
  image_prompt: imagePromptDefault,
  motion_prompt: motionPromptDefault,
  provider_video_prompt: providerVideoPromptDefault,
  analysis_prompt: analysisPromptDefault,
  script_prompt: scriptPromptDefault,
  breakdown_prompt: () => "[Breakdown prompt]",
  scene_extraction_prompt: () => "[Scene extraction prompt]",
  master_recreation_prompt: () => "[Master recreation prompt]",
  instruction_to_script_prompt: () => "[Instruction to script prompt]",
  script_to_shotlist_prompt: () => "[Script to shotlist prompt]",
  shotlist_to_video_prompt: () => "[Shotlist to video prompt]",
};

// ── Factory ──

let idCounter = 0;

export function buildPrompt(
  jobId: string,
  module: PromptModule,
  stage: PromptStage,
  variables: Record<string, unknown> = {},
  provider?: string,
): GenerationPrompt {
  const templateFn = TEMPLATE_MAP[stage] || (() => "");
  const defaultPrompt = templateFn(variables);
  const draft = loadDraft(jobId, module, stage);
  const isUserModified = draft !== null && draft !== defaultPrompt;
  const effectivePrompt = isUserModified ? draft! : defaultPrompt;

  return {
    id: `prompt_${++idCounter}_${Date.now()}`,
    jobId,
    module,
    stage,
    provider: provider || null,
    defaultPrompt,
    editedPrompt: isUserModified ? draft : null,
    effectivePrompt,
    variables,
    isUserModified,
    version: 1,
  };
}

export function resolveEffective(prompt: GenerationPrompt): string {
  if (prompt.editedPrompt !== null && prompt.editedPrompt !== undefined) {
    return prompt.editedPrompt;
  }
  return prompt.defaultPrompt;
}
