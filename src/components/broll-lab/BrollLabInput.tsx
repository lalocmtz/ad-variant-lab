import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Link, Sparkles, ShieldCheck, ImagePlus, Lock } from "lucide-react";
import type { BrollLabInputs } from "@/lib/broll_lab_types";

interface Props {
  onSubmit: (inputs: BrollLabInputs) => void;
  loading: boolean;
}

export default function BrollLabInput({ onSubmit, loading }: Props) {
  const [inputs, setInputs] = useState<BrollLabInputs>({
    tiktokUrl1: "",
    tiktokUrl2: "",
    tiktokUrl3: "",
    productImageUrl: "",
    productUrl: "",
    language: "es-MX",
    accent: "mexicano",
    voiceTone: "conversational, energético, UGC natural",
    voiceVariantCount: 5,
  });

  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [tiktokCompliance, setTiktokCompliance] = useState(false);
  const [productLock, setProductLock] = useState(true);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [additionalPreviews, setAdditionalPreviews] = useState<string[]>([]);

  const handleAdditionalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 3 - additionalImages.length;
    const toAdd = files.slice(0, remaining);
    const newPreviews: string[] = [];
    const newFiles: File[] = [];
    toAdd.forEach(file => {
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    });
    setAdditionalImages(prev => [...prev, ...newFiles]);
    setAdditionalPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeAdditionalImage = (idx: number) => {
    setAdditionalImages(prev => prev.filter((_, i) => i !== idx));
    setAdditionalPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setProductImagePreview(base64);
      setInputs((prev) => ({ ...prev, productImageUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    // Convert additional images to base64
    const additionalUrls: string[] = [];
    for (const file of additionalImages) {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      additionalUrls.push(b64);
    }
    onSubmit({
      ...inputs,
      tiktok_compliance: tiktokCompliance,
      productLock,
      additionalImageUrls: additionalUrls,
    });
  };

  const canSubmit = inputs.tiktokUrl1.trim() !== "" && inputs.productImageUrl !== "";

  return (
    <div className="space-y-6">
      {/* TikTok URLs */}
      <Card className="border-border/60 bg-card/80">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Link className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Videos de referencia TikTok</span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">URL principal (obligatorio)</Label>
              <Input
                placeholder="https://www.tiktok.com/@user/video/..."
                value={inputs.tiktokUrl1}
                onChange={(e) => setInputs((p) => ({ ...p, tiktokUrl1: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL secundaria (opcional)</Label>
              <Input
                placeholder="https://www.tiktok.com/@user/video/..."
                value={inputs.tiktokUrl2}
                onChange={(e) => setInputs((p) => ({ ...p, tiktokUrl2: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL terciaria (opcional)</Label>
              <Input
                placeholder="https://www.tiktok.com/@user/video/..."
                value={inputs.tiktokUrl3}
                onChange={(e) => setInputs((p) => ({ ...p, tiktokUrl3: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product image */}
      <Card className="border-border/60 bg-card/80">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Imagen del producto (obligatorio)</span>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex-1 cursor-pointer">
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                {productImagePreview ? (
                  <img src={productImagePreview} alt="Producto" className="mx-auto max-h-32 rounded object-contain" />
                ) : (
                  <p className="text-sm text-muted-foreground">Clic para subir imagen del producto</p>
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">URL del producto (opcional)</Label>
            <Input
              placeholder="https://tienda.com/producto"
              value={inputs.productUrl}
              onChange={(e) => setInputs((p) => ({ ...p, productUrl: e.target.value }))}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Voice settings */}
      <Card className="border-border/60 bg-card/80">
        <CardContent className="pt-5 space-y-3">
          <span className="text-sm font-medium text-foreground">Configuración de voz</span>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Idioma</Label>
              <Select value={inputs.language} onValueChange={(v) => setInputs((p) => ({ ...p, language: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="es-MX">Español México</SelectItem>
                  <SelectItem value="es-ES">Español España</SelectItem>
                  <SelectItem value="en-US">English US</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Acento</Label>
              <Select value={inputs.accent} onValueChange={(v) => setInputs((p) => ({ ...p, accent: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mexicano">Mexicano</SelectItem>
                  <SelectItem value="colombiano">Colombiano</SelectItem>
                  <SelectItem value="argentino">Argentino</SelectItem>
                  <SelectItem value="español">Español</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Tono de voz</Label>
            <Textarea
              value={inputs.voiceTone}
              onChange={(e) => setInputs((p) => ({ ...p, voiceTone: e.target.value }))}
              rows={2}
              className="mt-1"
              placeholder="conversational, energético, UGC natural"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Número de variantes de voz: <span className="font-semibold text-foreground">{inputs.voiceVariantCount}</span>
            </Label>
            <Slider
              value={[inputs.voiceVariantCount]}
              onValueChange={([v]) => setInputs((p) => ({ ...p, voiceVariantCount: v }))}
              min={3}
              max={20}
              step={1}
              className="mt-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>3</span>
              <span>20</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TikTok Compliance Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Filtro TikTok Shop Anti-Ban</p>
            <p className="text-xs text-muted-foreground">Evita claims médicos, garantías absolutas y lenguaje prohibido.</p>
          </div>
        </div>
        <Switch checked={tiktokCompliance} onCheckedChange={setTiktokCompliance} />
      </div>

      {/* Additional Product Images */}
      <Card className="border-border/60 bg-card/80">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Imágenes adicionales (opcional)</span>
          </div>
          <p className="text-xs text-muted-foreground">Hasta 3 fotos extra para contexto de tamaño, textura y apariencia real.</p>
          <div className="flex items-center gap-3 flex-wrap">
            {additionalPreviews.map((preview, idx) => (
              <div key={idx} className="relative w-20 h-20">
                <img src={preview} alt={`Extra ${idx + 1}`} className="w-full h-full object-cover rounded-lg border border-border" />
                <button type="button" onClick={() => removeAdditionalImage(idx)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">×</button>
              </div>
            ))}
            {additionalImages.length < 3 && (
              <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-foreground/40 transition-colors bg-card">
                <ImagePlus className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Agregar</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleAdditionalImageUpload} />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className="w-full gradient-cta text-white border-0 h-11"
        size="lg"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {loading ? "Procesando..." : "Generar B-Roll Variants"}
      </Button>
    </div>
  );
}
