import type { PromptModule, PromptStage } from "./promptTypes";

function key(jobId: string, module: PromptModule, stage: PromptStage): string {
  return `prompt_draft:${jobId}:${module}:${stage}`;
}

export function saveDraft(jobId: string, module: PromptModule, stage: PromptStage, text: string): void {
  try {
    localStorage.setItem(key(jobId, module, stage), text);
  } catch {
    // quota exceeded — silently ignore
  }
}

export function loadDraft(jobId: string, module: PromptModule, stage: PromptStage): string | null {
  try {
    return localStorage.getItem(key(jobId, module, stage));
  } catch {
    return null;
  }
}

export function clearDraft(jobId: string, module: PromptModule, stage: PromptStage): void {
  try {
    localStorage.removeItem(key(jobId, module, stage));
  } catch {
    // ignore
  }
}

export function clearAllDrafts(jobId: string, module: PromptModule): void {
  try {
    const prefix = `prompt_draft:${jobId}:${module}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
