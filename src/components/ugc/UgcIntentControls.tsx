import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Lock, User, MessageSquare } from "lucide-react";
import {
  type UgcIntent,
  type UgcPreset,
  DEFAULT_INTENT,
  UGC_PRESETS,
  LABELS,
} from "@/lib/ugcIntentTypes";

interface Props {
  intent: UgcIntent;
  onChange: (intent: UgcIntent) => void;
}

// Pill chip selector
function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
              value === opt
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            {labels[opt] || opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function UgcIntentControls({ intent, onChange }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>("recomendacion");

  const update = useCallback(
    (partial: Partial<UgcIntent>) => {
      const next = { ...intent, ...partial };
      // Auto-sync dialogue_lock with voice_mode
      if (partial.voice_mode === "dialogo_exacto") next.dialogue_lock = true;
      if (partial.voice_mode && partial.voice_mode !== "dialogo_exacto") next.dialogue_lock = false;
      onChange(next);
      setActivePreset(null); // custom selection breaks preset match
    },
    [intent, onChange]
  );

  const applyPreset = useCallback(
    (preset: UgcPreset) => {
      const next = { ...DEFAULT_INTENT, ...preset.intent };
      if (next.voice_mode === "dialogo_exacto") next.dialogue_lock = true;
      onChange(next);
      setActivePreset(preset.id);
    },
    [onChange]
  );

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Presets rápidos</span>
        <div className="flex flex-wrap gap-2">
          {UGC_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activePreset === preset.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              {preset.emoji} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expandable controls */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            🎯 Controles semánticos
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Row 1: Creative type + Voice mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChipGroup
              label="Tipo de creativo"
              options={["recomendacion", "testimonio", "demo", "problema_solucion", "before_after", "storytime"] as const}
              value={intent.creative_type}
              onChange={(v) => update({ creative_type: v })}
              labels={LABELS.creative_type}
            />
            <ChipGroup
              label="Modo de voz"
              options={["dialogo_exacto", "dialogo_guiado", "sin_voz"] as const}
              value={intent.voice_mode}
              onChange={(v) => update({ voice_mode: v })}
              labels={LABELS.voice_mode}
            />
          </div>

          {/* Row 2: Body target + Narrative structure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChipGroup
              label="Zona / contexto de uso"
              options={["axilas", "cara", "manos", "cuerpo", "cabello", "otra"] as const}
              value={intent.body_target}
              onChange={(v) => update({ body_target: v })}
              labels={LABELS.body_target}
            />
            <ChipGroup
              label="Estructura del video"
              options={["hook_solucion_cta", "hook_demo_cta", "story_producto_cta", "demo_first"] as const}
              value={intent.narrative_structure}
              onChange={(v) => update({ narrative_structure: v })}
              labels={LABELS.narrative_structure}
            />
          </div>

          {/* Row 3: Shot pattern + Product visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChipGroup
              label="Estilo de tomas"
              options={["one_take", "3_cuts_ugc", "selfie_closeup_cta", "review_style"] as const}
              value={intent.shot_pattern}
              onChange={(v) => update({ shot_pattern: v })}
              labels={LABELS.shot_pattern}
            />
            <ChipGroup
              label="Presencia del producto"
              options={["siempre_visible", "demo_cierre", "hero_final"] as const}
              value={intent.product_visibility}
              onChange={(v) => update({ product_visibility: v })}
              labels={LABELS.product_visibility}
            />
          </div>

          {/* Row 4: Realism + CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChipGroup
              label="Intensidad de realismo"
              options={["maximo", "balanceado", "pulido"] as const}
              value={intent.realism_level}
              onChange={(v) => update({ realism_level: v })}
              labels={LABELS.realism_level}
            />
            <ChipGroup
              label="CTA"
              options={["carrito_naranja", "comprar_ahora", "descubrir_mas", "ninguno"] as const}
              value={intent.cta_mode}
              onChange={(v) => update({ cta_mode: v })}
              labels={LABELS.cta_mode}
            />
          </div>

          {/* Locks */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Switch
                checked={intent.product_lock}
                onCheckedChange={(v) => update({ product_lock: v })}
              />
              <div className="flex items-center gap-1 text-xs text-foreground">
                <Lock className="h-3 w-3" /> Product Lock
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={intent.character_lock}
                onCheckedChange={(v) => update({ character_lock: v })}
              />
              <div className="flex items-center gap-1 text-xs text-foreground">
                <User className="h-3 w-3" /> Character Lock
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={intent.dialogue_lock}
                onCheckedChange={(v) => update({ dialogue_lock: v })}
                disabled={intent.voice_mode === "dialogo_exacto"}
              />
              <div className="flex items-center gap-1 text-xs text-foreground">
                <MessageSquare className="h-3 w-3" /> Dialogue Lock
                {intent.voice_mode === "dialogo_exacto" && (
                  <Badge variant="secondary" className="text-[8px] ml-1">Auto ON</Badge>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
