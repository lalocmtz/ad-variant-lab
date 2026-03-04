import { useState, useRef } from "react";
import { Upload, Link, Image, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface InputStepProps {
  onSubmit: (data: {
    url: string;
    productImage: File | null;
    referenceActor: File | null;
    variantCount: number;
  }) => void;
}

const InputStep = ({ onSubmit }: InputStepProps) => {
  const [url, setUrl] = useState("");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [referenceActor, setReferenceActor] = useState<File | null>(null);
  const [variantCount, setVariantCount] = useState(3);
  const productInputRef = useRef<HTMLInputElement>(null);
  const actorInputRef = useRef<HTMLInputElement>(null);

  const isValid = url.trim().length > 0 && url.includes("tiktok");

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ url, productImage, referenceActor, variantCount });
  };

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div className="space-y-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          Generador de Variantes
        </h2>
        <p className="text-sm text-muted-foreground">
          Pega el link de un anuncio de TikTok Shop. Recibe variantes con imagen y prompt para Kling.
        </p>
      </div>

      <div className="space-y-6">
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
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Image className="h-4 w-4 text-primary" />
            Imagen del Producto
            <span className="text-xs text-muted-foreground">(Opcional pero recomendado)</span>
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
                  Sube la imagen del producto para preservarlo en las variantes
                </span>
              </div>
            )}
          </button>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <User className="h-4 w-4 text-primary" />
            Actor de Referencia
            <span className="text-xs text-muted-foreground">(Opcional)</span>
          </Label>
          <input
            ref={actorInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setReferenceActor(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => actorInputRef.current?.click()}
            className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-border bg-card transition-colors hover:border-primary/50 hover:bg-muted"
          >
            {referenceActor ? (
              <span className="text-sm text-foreground">{referenceActor.name}</span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Guía el tipo de persona en las variantes generadas
                </span>
              </div>
            )}
          </button>
        </div>

        <div className="space-y-3">
          <Label className="flex items-center justify-between text-sm font-medium text-foreground">
            <span>Número de Variantes</span>
            <span className="font-mono text-primary">{variantCount}</span>
          </Label>
          <Slider
            value={[variantCount]}
            onValueChange={([v]) => setVariantCount(v)}
            min={1}
            max={5}
            step={1}
            className="py-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>5</span>
          </div>
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
