import { useState, useCallback } from "react";
import { Copy, RotateCcw, ChevronDown, ChevronUp, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { GenerationPrompt } from "@/lib/promptTypes";
import { STAGE_LABELS } from "@/lib/promptTypes";

interface EditablePromptCardProps {
  prompt: GenerationPrompt;
  onChange: (newText: string) => void;
  onReset: () => void;
  collapsedByDefault?: boolean;
}

const EditablePromptCard = ({ prompt, onChange, onReset, collapsedByDefault = true }: EditablePromptCardProps) => {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt.effectivePrompt);
      setCopied(true);
      toast.success("Prompt copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Error copiando prompt");
    }
  }, [prompt.effectivePrompt]);

  const stageLabel = STAGE_LABELS[prompt.stage] || prompt.stage;
  const previewText = prompt.effectivePrompt.slice(0, 120);

  return (
    <div className="rounded-lg border border-border/60 bg-card/80">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex-1 text-xs font-medium text-foreground truncate">
          {stageLabel}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {prompt.provider && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {prompt.provider}
            </Badge>
          )}
          {prompt.isUserModified && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
              <Pencil className="h-2.5 w-2.5" /> Editado
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Collapsed preview */}
      {!expanded && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-muted-foreground truncate">{previewText}…</p>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border/40 px-3 py-3 space-y-2">
          <Textarea
            value={prompt.effectivePrompt}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[160px] text-xs font-mono bg-background/50"
            placeholder="Prompt vacío"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            {prompt.isUserModified && (
              <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1">
                <RotateCcw className="h-3 w-3" /> Restaurar
              </Button>
            )}
          </div>
          {prompt.variables && Object.keys(prompt.variables).length > 0 && (
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Variables ({Object.keys(prompt.variables).length})</summary>
              <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-[10px]">
                {JSON.stringify(prompt.variables, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default EditablePromptCard;
