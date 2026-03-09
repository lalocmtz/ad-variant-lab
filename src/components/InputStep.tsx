import { useState, useRef } from "react";
import { Upload, Link, Image, Sparkles, Globe, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type VideoMode = "avatar" | "no_avatar";

interface InputStepProps {
  onSubmit: (data: {
    url: string;
    productImage: File | null;
    variantCount: number;
    videoMode: VideoMode;
    language: string;
    diversity_intensity: string;
  }) => void;
}

const LANGUAGES = [
  { value: "es-MX", label: "Español (México)" },
  { value: "es-US", label: "Español (US)" },
  { value: "es-CO", label: "Español (Colombia)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "en-US", label: "English (US)" },
];

const DIVERSITY_OPTIONS = [
  { value: "low", label: "Baja", desc: "Actores similares al original" },
  { value: "medium", label: "Media", desc: "Actores distintos, mismo mercado" },
  { value: "high", label: "Alta", desc: "Actores claramente diferentes" },
];

const InputStep = ({ onSubmit }: InputStepProps) => {
  const [url, setUrl] = useState("");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [language, setLanguage] = useState("es-MX");
  const [diversityIntensity, setDiversityIntensity] = useState("high");
  const productInputRef = useRef<HTMLInputElement>(null);

  const isValid = url.trim().length > 0 && url.includes("tiktok") && productImage !== null;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      url,
      productImage,
      variantCount: 3,
      videoMode: "avatar",
      language,
      diversity_intensity: diversityIntensity,
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div className="space-y-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          Video Variant Console
        </h2>
        <p className="text-sm text-muted-foreground">
          Analiza un TikTok ganador. Recibe 3 variantes con imágenes UGC y guiones listos para HeyGen.
        </p>
      </div>

      <div className="space-y-6">
        {/* TikTok URL */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link className="h-4 w-4 text-primary" />
            URL del Video de TikTok
          </Label>
          <Input
            placeholder="Pega el link de TikTok Shop aquí"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-12 border-border bg-card font-mono text-sm text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
          <p className="text-[10px] text-muted-foreground">
            El video será analizado para extraer la fórmula ganadora y generar variantes con actores distintos.
          </p>
        </div>

        {/* Product Image */}
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
            className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-border bg-card transition-colors hover:border-primary/50 hover:bg-muted"
          >
            {productImage ? (
              <span className="text-sm text-foreground">{productImage.name}</span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  La imagen del producto es la verdad absoluta — se preservará idéntica en todas las variantes
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe className="h-4 w-4 text-primary" />
            Idioma del Guión
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-10 border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Los guiones generados estarán en este idioma, adaptados al mercado seleccionado.
          </p>
        </div>

        {/* Diversity Intensity */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="h-4 w-4 text-primary" />
            Diversidad de Actores
          </Label>
          <Select value={diversityIntensity} onValueChange={setDiversityIntensity}>
            <SelectTrigger className="h-10 border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIVERSITY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label} — {d.desc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fixed variant count display */}
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">Variantes a generar</span>
          <span className="font-mono text-lg font-bold text-primary">3</span>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          className="h-12 w-full gap-2 gradient-primary text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-30"
          size="lg"
        >
          <Sparkles className="h-4 w-4" />
          Analizar y Generar Variantes
        </Button>
      </div>
    </div>
  );
};

export default InputStep;
