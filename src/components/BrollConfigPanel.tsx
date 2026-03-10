import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Globe, Mic, Volume2 } from "lucide-react";

interface BrollConfigPanelProps {
  coverUrl: string;
  onStart: (config: BrollConfig) => void;
  onCancel: () => void;
}

export interface BrollConfig {
  variant_count: number;
  language: string;
  accent: string;
  tone: string;
}

const VARIANT_COUNTS = [
  { value: "3", label: "3 variantes" },
  { value: "5", label: "5 variantes" },
  { value: "10", label: "10 variantes" },
];

const TONES = [
  { value: "natural_ugc", label: "Natural UGC", desc: "Creador casual recomendando" },
  { value: "enthusiastic", label: "Entusiasta", desc: "Energético y emocionado" },
  { value: "calm_authority", label: "Autoridad calmada", desc: "Seguro y experto" },
  { value: "urgent", label: "Urgente", desc: "FOMO y escasez" },
];

const BrollConfigPanel = ({ coverUrl, onStart, onCancel }: BrollConfigPanelProps) => {
  const [variantCount, setVariantCount] = useState("3");
  const [language] = useState("es-MX");
  const [accent] = useState("mexicano");
  const [tone, setTone] = useState("natural_ugc");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-foreground">Configurar Voice-Over B-Roll</h2>
        <p className="text-sm text-muted-foreground">
          El mismo video se combinará con múltiples voice-overs generados con diferentes ángulos de persuasión.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Preview */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Video base</Label>
          <div className="overflow-hidden rounded-xl border border-border">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="aspect-[9/16] w-full object-cover" />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center bg-muted text-xs text-muted-foreground">
                Sin preview
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Este video se usa como base visual para todas las variantes.</p>
        </div>

        {/* Config */}
        <div className="col-span-2 space-y-5">
          {/* Variant count */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Cantidad de variantes
            </Label>
            <Select value={variantCount} onValueChange={setVariantCount}>
              <SelectTrigger className="h-10 border-border bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIANT_COUNTS.map(v => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language (locked for now) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="h-4 w-4 text-primary" />
              Idioma y acento
            </Label>
            <div className="flex gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <span className="text-sm text-foreground">Español (México)</span>
              <span className="text-sm text-muted-foreground">· Acento mexicano</span>
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mic className="h-4 w-4 text-primary" />
              Tono de voz
            </Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-10 border-border bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} — {t.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice info */}
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Voz: Roger (ElevenLabs multilingual) — Natural, compatible con español mexicano
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Volver
            </Button>
            <Button
              className="flex-1 gap-2 gradient-primary text-primary-foreground hover:opacity-90"
              onClick={() => onStart({
                variant_count: parseInt(variantCount),
                language,
                accent,
                tone,
              })}
            >
              <Sparkles className="h-4 w-4" />
              Generar {variantCount} Voice-Overs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrollConfigPanel;
