import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Image as ImageIcon, Sparkles, Download, Copy, Check, Replace, Loader2, Lock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

interface Brand {
  id: string;
  name: string;
  description: string | null;
  colors: any;
  fonts: any;
  brand_intelligence: string | null;
}

interface BrandAsset {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

interface GeneratedVariant {
  id: string;
  image_url: string | null;
  prompt: string | null;
  status: string;
}

const pipelineSteps = [
  "Understanding reference creative",
  "Applying brand system",
  "Generating variant directions",
  "Generating images",
  "Ready",
];

export default function StaticVariants() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [variantCount, setVariantCount] = useState(3);
  const [packagingLock, setPackagingLock] = useState(true);
  const [styleIntensity, setStyleIntensity] = useState([30]);
  const [generating, setGenerating] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load brands
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
      if (data) {
        setBrands(data);
        if (data.length > 0 && !selectedBrandId) setSelectedBrandId(data[0].id);
      }
    };
    load();
  }, []);

  // Load brand assets when brand changes
  useEffect(() => {
    if (!selectedBrandId) return;
    const load = async () => {
      const { data } = await supabase.from("brand_assets").select("*").eq("brand_id", selectedBrandId);
      if (data) setBrandAssets(data);
    };
    load();
  }, [selectedBrandId]);

  const selectedBrand = brands.find(b => b.id === selectedBrandId);
  const productImages = brandAssets.filter(a => a.category === "product_image");
  const brandColors = selectedBrand?.colors && Array.isArray(selectedBrand.colors) ? selectedBrand.colors : [];
  const brandFonts = selectedBrand?.fonts && Array.isArray(selectedBrand.fonts) ? selectedBrand.fonts : [];

  const handleFileSelect = (file: File) => {
    setReferenceImage(file);
    const url = URL.createObjectURL(file);
    setReferencePreview(url);
  };

  const handleGenerate = async () => {
    if (!referenceImage || !selectedBrand) {
      toast.error("Upload a reference creative and select a brand profile.");
      return;
    }

    setGenerating(true);
    setVariants([]);
    setPipelineStep(0);

    try {
      // Upload reference image
      const ext = referenceImage.name.split(".").pop() || "png";
      const path = `static-refs/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("videos").upload(path, referenceImage, { contentType: referenceImage.type });
      if (uploadErr) throw new Error("Failed to upload reference image");
      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(path);
      const referenceUrl = pubUrl.publicUrl;

      // Get product image URL (first product image from brand assets)
      const productImageUrl = productImages.length > 0 ? productImages[0].image_url : null;

      setPipelineStep(1);
      await new Promise(r => setTimeout(r, 500));
      setPipelineStep(2);

      // Generate variants
      const generatedVariants: GeneratedVariant[] = [];
      for (let i = 0; i < variantCount; i++) {
        setPipelineStep(3);
        try {
          const { data, error } = await supabase.functions.invoke("generate-static-ad", {
            body: {
              brand_name: selectedBrand.name,
              brand_description: selectedBrand.description,
              brand_intelligence: selectedBrand.brand_intelligence,
              template_image_url: referenceUrl,
              product_image_url: productImageUrl,
              profile: {
                name: `Variant ${String.fromCharCode(65 + i)}`,
                age_range: "25-45",
                pain_points: "Needs high-converting static ads",
                desires: "Professional, brand-aligned creatives",
                messaging_angle: `Creative direction ${i + 1}: ${styleIntensity[0] > 50 ? "Strong brand expression" : "Subtle brand integration"}`,
              },
              cta: "",
              aspect_ratio: "1:1",
              packaging_lock: packagingLock,
              style_intensity: styleIntensity[0],
              negative_prompt: "no logos, no watermarks, no random text, no extra hands, no distorted fingers, no product redesign",
            },
          });

          generatedVariants.push({
            id: crypto.randomUUID(),
            image_url: data?.image_url || null,
            prompt: data?.prompt || null,
            status: error || data?.error ? "failed" : "completed",
          });
        } catch {
          generatedVariants.push({
            id: crypto.randomUUID(),
            image_url: null,
            prompt: null,
            status: "failed",
          });
        }
        setVariants([...generatedVariants]);
      }

      setPipelineStep(4);
      toast.success(`${generatedVariants.filter(v => v.status === "completed").length}/${variantCount} variants generated`);
    } catch (e: any) {
      toast.error(e.message || "Error generating variants");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Static Variant Studio</h1>
        <p className="text-sm text-muted-foreground">Upload a reference creative, apply your brand, and generate high-performing static ad variants.</p>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-8">
        {/* LEFT: Inputs */}
        <div className="space-y-6">
          {/* Reference Creative */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Reference Creative</h3>
            <p className="text-xs text-muted-foreground">Upload the winning static ad you want to iterate on.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            {referencePreview ? (
              <div className="relative">
                <img src={referencePreview} alt="Reference" className="w-full rounded-xl object-contain max-h-64 bg-muted" />
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Replace className="h-3.5 w-3.5 mr-1" />
                  Replace
                </Button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-40 w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-background hover:border-primary/30 hover:bg-muted/30 transition-all"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm font-medium">Click to upload</span>
                  <span className="text-xs">PNG, JPG up to 25MB</span>
                </div>
              </button>
            )}
          </div>

          {/* Brand Profile */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Brand Profile</h3>
            {brands.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">No brand profiles yet.</p>
                <Button variant="outline" size="sm" onClick={() => window.location.href = "/library/brand"}>
                  Create Brand Profile
                </Button>
              </div>
            ) : (
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {selectedBrand && (
              <div className="space-y-3 pt-2">
                {brandColors.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Colors</span>
                    <div className="flex gap-1.5">
                      {(brandColors as string[]).map((c, i) => (
                        <div key={i} className="h-6 w-6 rounded-md border border-border" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  </div>
                )}
                {brandFonts.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Fonts</span>
                    <div className="flex flex-wrap gap-1">
                      {(brandFonts as string[]).map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {productImages.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Product Images</span>
                    <div className="flex gap-1.5">
                      {productImages.slice(0, 4).map(a => (
                        <img key={a.id} src={a.image_url} alt={a.name} className="h-10 w-10 rounded-md object-cover border border-border" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Options</h3>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-sm">Packaging Lock</Label>
              </div>
              <Switch checked={packagingLock} onCheckedChange={setPackagingLock} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-sm">Style Intensity</Label>
                </div>
                <span className="text-xs text-muted-foreground">{styleIntensity[0] <= 30 ? "Subtle" : styleIntensity[0] <= 70 ? "Moderate" : "Strong"}</span>
              </div>
              <Slider value={styleIntensity} onValueChange={setStyleIntensity} min={0} max={100} step={10} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Variant Count</Label>
                <span className="text-sm font-mono text-foreground">{variantCount}</span>
              </div>
              <Slider value={[variantCount]} onValueChange={([v]) => setVariantCount(v)} min={1} max={5} step={1} />
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !referenceImage || !selectedBrand}
            className="w-full h-12 gradient-cta text-white border-0 text-sm font-semibold gap-2"
            size="lg"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generate Static Variants</>
            )}
          </Button>
        </div>

        {/* RIGHT: Preview / Output */}
        <div className="space-y-6">
          {/* Pipeline Progress */}
          {generating && pipelineStep >= 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Processing</h3>
              <div className="space-y-2">
                {pipelineSteps.map((step, i) => (
                  <div key={step} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                    i === pipelineStep ? "bg-primary/5 text-foreground font-medium" :
                    i < pipelineStep ? "text-muted-foreground" : "text-muted-foreground/40"
                  }`}>
                    {i < pipelineStep ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : i === pipelineStep ? (
                      <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-border" />
                    )}
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated Variants */}
          {variants.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Generated Variants ({variants.filter(v => v.image_url).length})</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {variants.map((v, i) => (
                  <div key={v.id} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden group">
                    {v.image_url ? (
                      <>
                        <div className="relative">
                          <img src={v.image_url} alt={`Variant ${String.fromCharCode(65 + i)}`} className="w-full aspect-square object-cover" />
                          <div className="absolute top-2 left-2 flex gap-1">
                            <Badge variant="secondary" className="text-[10px] bg-card/80 backdrop-blur-sm">BRAND_APPLIED</Badge>
                            {packagingLock && <Badge variant="secondary" className="text-[10px] bg-card/80 backdrop-blur-sm">PACKAGING_LOCKED</Badge>}
                          </div>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">Variant {String.fromCharCode(65 + i)}</span>
                          <div className="flex gap-1">
                            <a href={v.image_url} download target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                            </a>
                            {v.prompt && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => copyToClipboard(v.prompt!, v.id)}
                              >
                                {copiedId === v.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted/30">
                        {v.status === "failed" ? (
                          <p className="text-xs text-muted-foreground">Generation failed</p>
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : !generating ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center space-y-3">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No variants yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Upload a reference creative and select a brand to get started.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
