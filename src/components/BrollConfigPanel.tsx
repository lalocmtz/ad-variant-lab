import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Globe, Mic, Volume2, Plus, Trash2, Upload, Link, Image, Video, Info } from "lucide-react";

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
  additional_reference_urls: string[];
  product_image: File | null;
  product_url: string;
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
  const [additionalUrls, setAdditionalUrls] = useState<string[]>([]);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productUrl, setProductUrl] = useState("");
  const productInputRef = useRef<HTMLInputElement>(null);

  const addReferenceUrl = () => {
    if (additionalUrls.length < 3) {
      setAdditionalUrls([...additionalUrls, ""]);
    }
  };

  const updateReferenceUrl = (index: number, value: string) => {
    const updated = [...additionalUrls];
    updated[index] = value;
    setAdditionalUrls(updated);
  };

  const removeReferenceUrl = (index: number) => {
    setAdditionalUrls(additionalUrls.filter((_, i) => i !== index));
  };

  const hasProductImage = !!productImage;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-foreground">Configurar Voice-Over B-Roll</h2>
        <p className="text-sm text-muted-foreground">
          Se generará un video nuevo desde cero basado en los patrones de tus referencias, combinado con múltiples voice-overs.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Nuevo: Video generado desde cero</p>
          <p className="text-[11px] text-muted-foreground">
            Los videos de referencia se usan solo como inspiración. El sistema detecta patrones comunes y genera un video original nuevo usando IA. No se reutiliza el video original.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column: References */}
        <div className="space-y-4">
          <Label className="text-xs font-medium text-muted-foreground">Video de referencia principal</Label>
          <div className="overflow-hidden rounded-xl border border-border">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="aspect-[9/16] w-full object-cover" />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center bg-muted text-xs text-muted-foreground">
                Sin preview
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Este video se analiza como referencia, NO se usa como visual final.
          </p>

          {/* Additional reference URLs */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <Video className="h-3 w-3 text-primary" />
              Más videos de referencia (opcional)
            </Label>
            {additionalUrls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`URL TikTok referencia ${i + 2}`}
                  value={url}
                  onChange={(e) => updateReferenceUrl(i, e.target.value)}
                  className="h-8 text-xs border-border bg-card"
                />
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeReferenceUrl(i)}>
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
            {additionalUrls.length < 3 && (
              <Button variant="outline" size="sm" className="h-7 w-full gap-1 text-[10px]" onClick={addReferenceUrl}>
                <Plus className="h-3 w-3" />
                Agregar referencia ({additionalUrls.length + 1}/4)
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground">
              Más referencias = mejor síntesis de patrones ganadores.
            </p>
          </div>
        </div>

        {/* Right columns: Config */}
        <div className="col-span-2 space-y-5">
          {/* Product image */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Image className="h-4 w-4 text-primary" />
              Imagen del Producto
              <span className="text-xs font-semibold text-destructive">(Obligatorio)</span>
            </Label>
            <input
              ref={productInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setProductImage(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => productInputRef.current?.click()}
              className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border bg-card transition-colors hover:border-primary/50 hover:bg-muted"
            >
              {productImage ? (
                <span className="text-sm text-foreground">{productImage.name}</span>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    La imagen del producto es la verdad visual absoluta
                  </span>
                </div>
              )}
            </button>
          </div>

          {/* Product URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link className="h-4 w-4 text-primary" />
              URL del Producto (opcional)
            </Label>
            <Input
              placeholder="https://shop.tiktok.com/..."
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              className="h-10 border-border bg-card text-sm"
            />
          </div>

          {/* Variant count */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Cantidad de variantes de voz
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

          {/* Language */}
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
              disabled={!hasProductImage}
              onClick={() => onStart({
                variant_count: parseInt(variantCount),
                language,
                accent,
                tone,
                additional_reference_urls: additionalUrls.filter(u => u.trim().length > 0),
                product_image: productImage,
                product_url: productUrl.trim(),
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
