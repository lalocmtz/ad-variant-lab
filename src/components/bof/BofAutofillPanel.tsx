import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Loader2, Sparkles, AlertCircle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BofAutofillResult } from "@/lib/bof_types";

interface BofAutofillPanelProps {
  onAutofillComplete: (data: BofAutofillResult) => void;
}

type AutofillStatus = "idle" | "loading" | "success" | "partial" | "error";

const STATUS_MESSAGES: Record<string, string> = {
  loading: "Analizando enlace…",
  success: "Formulario autocompletado",
  partial: "Se cargaron solo algunos campos. Revisa y completa manualmente lo faltante.",
  error: "No se pudo extraer suficiente información del enlace",
};

export default function BofAutofillPanel({ onAutofillComplete }: BofAutofillPanelProps) {
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AutofillStatus>("idle");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductImageFile(file);

    // Upload immediately for the analysis
    const ext = file.name.split(".").pop() || "png";
    const fileName = `bof_autofill_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("videos").upload(fileName, file, { contentType: file.type });
    if (error) {
      toast.error("Error subiendo imagen");
      return;
    }
    const { data } = supabase.storage.from("videos").getPublicUrl(fileName);
    setProductImageUrl(data.publicUrl);
  };

  const handleAnalyze = async () => {
    if (!tiktokUrl && !productUrl) {
      toast.error("Pega al menos una URL para analizar");
      return;
    }

    setStatus("loading");

    try {
      const { data, error } = await supabase.functions.invoke("analyze-bof-source", {
        body: { tiktok_url: tiktokUrl, product_url: productUrl, product_image_url: productImageUrl },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Error en análisis");
      }

      const result: BofAutofillResult = {
        product_name: data.product_name || "",
        current_price: data.current_price || "",
        old_price: data.old_price || "",
        main_benefit: data.main_benefit || "",
        offer: data.offer || "",
        pain_point: data.pain_point || "",
        audience: data.audience || "",
        suggested_formats: data.suggested_formats || [],
        language: data.language || "es-MX",
        accent: data.accent || "mexicano",
        confidence: data.confidence || {},
        product_image_file: productImageFile || undefined,
      };

      // Determine if partial or full
      const filledCount = [result.product_name, result.current_price, result.main_benefit].filter(Boolean).length;
      setStatus(filledCount >= 2 ? "success" : "partial");

      onAutofillComplete(result);
      toast.success("Campos sugeridos cargados — revisa antes de generar");
    } catch (e: any) {
      console.error("Autofill error:", e);
      setStatus("error");
      toast.error(e.message || "Error analizando fuentes");
    }
  };

  const canAnalyze = (tiktokUrl || productUrl) && status !== "loading";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Autocompletar desde enlace</h3>
        <span className="text-xs text-muted-foreground ml-auto">Opcional</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">TikTok URL</Label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={tiktokUrl}
              onChange={e => setTiktokUrl(e.target.value)}
              placeholder="https://www.tiktok.com/..."
              className="pl-9"
              disabled={status === "loading"}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Product URL</Label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={productUrl}
              onChange={e => setProductUrl(e.target.value)}
              placeholder="https://tienda.com/producto"
              className="pl-9"
              disabled={status === "loading"}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          <ImageIcon className="h-4 w-4" />
          {productImageFile ? productImageFile.name : "Imagen del producto (opcional)"}
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={status === "loading"} />
        </label>
        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Analizando…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1.5" />
                Analizar y autocompletar
              </>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {status !== "idle" && status !== "loading" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              status === "success"
                ? "bg-accent text-accent-foreground"
                : status === "partial"
                ? "bg-muted text-muted-foreground"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {status === "error" ? <AlertCircle className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {STATUS_MESSAGES[status]}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
