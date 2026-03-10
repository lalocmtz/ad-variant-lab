import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Package, DollarSign, Target, Zap, Users, Hash, Globe, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BOF_FORMATS } from "@/lib/bof_video_formats";
import type { BofFormData } from "@/lib/bof_types";

interface BofInputFormProps {
  onSubmit: (data: BofFormData) => void;
  isLoading: boolean;
}

export default function BofInputForm({ onSubmit, isLoading }: BofInputFormProps) {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string>("");
  const [productName, setProductName] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [mainBenefit, setMainBenefit] = useState("");
  const [offer, setOffer] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [audience, setAudience] = useState("");
  const [variantsCount, setVariantsCount] = useState(3);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["01_LO_SIENTO_POR_LOS_QUE"]);
  const [language, setLanguage] = useState("es-MX");
  const [accent, setAccent] = useState("mexicano");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(file);
      setProductImagePreview(URL.createObjectURL(file));
    }
  };

  const toggleFormat = (formatId: string) => {
    setSelectedFormats(prev =>
      prev.includes(formatId)
        ? prev.filter(f => f !== formatId)
        : [...prev, formatId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productImage || !productName || !currentPrice || !mainBenefit || selectedFormats.length === 0) return;
    onSubmit({
      product_image: productImage,
      product_name: productName,
      current_price: currentPrice,
      old_price: oldPrice,
      main_benefit: mainBenefit,
      offer,
      pain_point: painPoint,
      audience,
      variants_count: variantsCount,
      selected_formats: selectedFormats,
      language,
      accent,
    });
  };

  const canSubmit = productImage && productName && currentPrice && mainBenefit && selectedFormats.length > 0 && !isLoading;

  return (
    <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Generar BOF Videos</h1>
        <p className="text-sm text-muted-foreground mt-1">Genera 3–5 anuncios verticales de producto para TikTok Shop desde una sola imagen.</p>
      </div>

      {/* Product Image */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Imagen del producto *</Label>
        <div className="flex items-start gap-4">
          <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-foreground/40 transition-colors bg-card">
            {productImagePreview ? (
              <img src={productImagePreview} alt="Product" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <span className="text-xs">Subir</span>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
          <div className="flex-1 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nombre del producto *</Label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Sérum facial anti-edad" className="pl-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Precio actual *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="$299" className="pl-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Precio anterior</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={oldPrice} onChange={e => setOldPrice(e.target.value)} placeholder="$599" className="pl-9" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits & Offer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Beneficio principal *</Label>
          <div className="relative">
            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={mainBenefit} onChange={e => setMainBenefit(e.target.value)} placeholder="Reduce arrugas en 2 semanas" className="pl-9" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Oferta / urgencia</Label>
          <div className="relative">
            <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={offer} onChange={e => setOffer(e.target.value)} placeholder="2x1 solo hoy" className="pl-9" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Pain point</Label>
          <Input value={painPoint} onChange={e => setPainPoint(e.target.value)} placeholder="Mi piel se veía opaca y sin vida" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Audiencia</Label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Mujeres 25-40 años" className="pl-9" />
          </div>
        </div>
      </div>

      {/* Format Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Formatos *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BOF_FORMATS.map(format => (
            <label
              key={format.format_id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selectedFormats.includes(format.format_id)
                  ? "border-foreground bg-accent"
                  : "border-border bg-card hover:border-foreground/30"
              }`}
            >
              <Checkbox
                checked={selectedFormats.includes(format.format_id)}
                onCheckedChange={() => toggleFormat(format.format_id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{format.format_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{format.psychology}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Variants Count */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Hash className="h-4 w-4" /> Variantes
          </Label>
          <span className="text-sm font-mono text-foreground">{variantsCount}</span>
        </div>
        <Slider value={[variantsCount]} onValueChange={v => setVariantsCount(v[0])} min={3} max={5} step={1} className="w-full" />
      </div>

      {/* Language & Accent */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Idioma</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="es-MX">Español (México)</SelectItem>
              <SelectItem value="es-CO">Español (Colombia)</SelectItem>
              <SelectItem value="es-ES">Español (España)</SelectItem>
              <SelectItem value="en-US">English (US)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><Mic className="h-3 w-3" /> Acento</Label>
          <Select value={accent} onValueChange={setAccent}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mexicano">Mexicano</SelectItem>
              <SelectItem value="colombiano">Colombiano</SelectItem>
              <SelectItem value="castellano">Castellano</SelectItem>
              <SelectItem value="american">American</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!canSubmit} className="w-full gradient-cta text-white border-0 h-12 text-base font-semibold">
        {isLoading ? "Generando…" : `Generar ${variantsCount} BOF Videos`}
      </Button>
    </motion.form>
  );
}
