import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import VariantCard from "@/components/VariantCard";
import PromptSection from "@/components/prompts/PromptSection";
import type { AnalysisResult, VariantStatus, VideoGenerationStatus } from "@/pages/Index";
import type { GenerationPrompt } from "@/lib/promptTypes";
import { buildPrompt, resolveEffective } from "@/lib/promptRegistry";
import { saveDraft, clearDraft } from "@/lib/promptDraftStore";

interface ResultsViewProps {
  results: AnalysisResult;
  language?: string;
  accent?: string;
  onReset: () => void;
  onRegenerateVariant: (variantIndex: number) => void;
  onUpdateVariantStatus: (variantIndex: number, status: VariantStatus) => void;
  onUpdateVariantVideoState?: (variantIndex: number, videoState: { video_task_id?: string; video_status?: VideoGenerationStatus; video_url?: string; video_error?: string; video_mode?: string }) => void;
}

const ResultsView = ({
  results,
  language,
  accent,
  onReset,
  onRegenerateVariant,
  onUpdateVariantStatus,
  onUpdateVariantVideoState,
}: ResultsViewProps) => {
  // Build prompts for each variant
  const buildVariantPrompts = useCallback(() => {
    const all: GenerationPrompt[] = [];
    results.variants.forEach((v, i) => {
      const jobId = v.variant_id || `variant_${i}`;

      // Image prompt
      all.push(
        buildPrompt(jobId, "video_variants", "image_prompt", {
          base_image_prompt: v.base_image_prompt_9x16 || "",
        }, "Gemini")
      );

      // Provider video prompt (the full animation prompt)
      if (v.prompt_package?.prompt_text) {
        all.push(
          buildPrompt(jobId, "video_variants", "provider_video_prompt", {
            prompt_text: v.prompt_package.prompt_text,
          }, "Sora 2")
        );
      }
    });
    return all;
  }, [results.variants]);

  const [prompts, setPrompts] = useState<GenerationPrompt[]>(() => buildVariantPrompts());

  const handlePromptChange = useCallback((promptId: string, newText: string) => {
    setPrompts(prev =>
      prev.map(p => {
        if (p.id !== promptId) return p;
        const isModified = newText !== p.defaultPrompt;
        saveDraft(p.jobId, p.module, p.stage, newText);
        return {
          ...p,
          editedPrompt: isModified ? newText : null,
          effectivePrompt: newText,
          isUserModified: isModified,
        };
      })
    );
  }, []);

  const handlePromptReset = useCallback((promptId: string) => {
    setPrompts(prev =>
      prev.map(p => {
        if (p.id !== promptId) return p;
        clearDraft(p.jobId, p.module, p.stage);
        return {
          ...p,
          editedPrompt: null,
          effectivePrompt: p.defaultPrompt,
          isUserModified: false,
        };
      })
    );
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <button
          onClick={onReset}
          className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Nuevo Análisis
        </button>
        <h2 className="text-xl font-bold text-foreground">
          Variantes Generadas ({results.variants.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Copia el prompt universal y pégalo directamente en Sora, HeyGen, Kling, Runway o AIgen. Blueprint comprimido a 15 segundos. También puedes generar el video directamente.
        </p>
      </div>

      {/* Prompt Surface Layer */}
      <PromptSection
        title="Prompts de Generación"
        prompts={prompts}
        onPromptChange={handlePromptChange}
        onPromptReset={handlePromptReset}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {results.variants.map((variant, index) => (
          <VariantCard
            key={variant.variant_id}
            variant={variant}
            language={language}
            accent={accent}
            onRegenerate={() => onRegenerateVariant(index)}
            onApprove={() => onUpdateVariantStatus(index, "approved")}
            onReject={() => onUpdateVariantStatus(index, "rejected")}
            onVideoStateChange={(videoState) => onUpdateVariantVideoState?.(index, videoState)}
          />
        ))}
      </div>
    </div>
  );
};

export default ResultsView;
