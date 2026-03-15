import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import EditablePromptCard from "./EditablePromptCard";
import type { GenerationPrompt } from "@/lib/promptTypes";

interface PromptSectionProps {
  title?: string;
  prompts: GenerationPrompt[];
  onPromptChange: (promptId: string, newText: string) => void;
  onPromptReset: (promptId: string) => void;
  defaultVisible?: boolean;
}

const PromptSection = ({
  title = "Prompts",
  prompts,
  onPromptChange,
  onPromptReset,
  defaultVisible = false,
}: PromptSectionProps) => {
  const [visible, setVisible] = useState(defaultVisible);

  if (prompts.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVisible(!visible)}
          className="h-7 text-xs gap-1 text-muted-foreground"
        >
          {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {visible ? "Ocultar" : "Mostrar"} ({prompts.length})
        </Button>
      </div>
      {visible && (
        <div className="space-y-2">
          {prompts.map((p) => (
            <EditablePromptCard
              key={p.id}
              prompt={p}
              onChange={(text) => onPromptChange(p.id, text)}
              onReset={() => onPromptReset(p.id)}
              collapsedByDefault={prompts.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PromptSection;
