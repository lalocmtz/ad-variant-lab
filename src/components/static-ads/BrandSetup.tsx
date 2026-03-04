import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Brand } from "@/pages/StaticAds";

interface Props {
  brand: Brand | null;
  onSaved: (id: string) => void;
}

export default function BrandSetup({ brand, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colors, setColors] = useState("");
  const [fonts, setFonts] = useState("");
  const [intelligence, setIntelligence] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (brand) {
      setName(brand.name);
      setDescription(brand.description || "");
      setColors(Array.isArray(brand.colors) ? brand.colors.join(", ") : "");
      setFonts(Array.isArray(brand.fonts) ? brand.fonts.join(", ") : "");
      setIntelligence(brand.brand_intelligence || "");
    } else {
      setName(""); setDescription(""); setColors(""); setFonts(""); setIntelligence("");
    }
  }, [brand]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        colors: colors.split(",").map(c => c.trim()).filter(Boolean),
        fonts: fonts.split(",").map(f => f.trim()).filter(Boolean),
        brand_intelligence: intelligence.trim() || null,
      };

      if (brand) {
        const { error } = await supabase.from("brands").update(payload).eq("id", brand.id);
        if (error) throw error;
        toast.success("Brand actualizado");
        onSaved(brand.id);
      } else {
        const { data, error } = await supabase.from("brands").insert(payload).select("id").single();
        if (error) throw error;
        toast.success("Brand creado");
        onSaved(data.id);
      }
    } catch (e: any) {
      toast.error(e.message || "Error guardando brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Información del Brand</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre del Brand *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Groons" />
          </div>
          <div>
            <Label>Descripción del Producto</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Gummies saludables para niños" rows={3} />
          </div>
          <div>
            <Label>Colores (separados por coma)</Label>
            <Input value={colors} onChange={e => setColors(e.target.value)} placeholder="Ej: #FF5733, #3498DB" />
          </div>
          <div>
            <Label>Fuentes (separadas por coma)</Label>
            <Input value={fonts} onChange={e => setFonts(e.target.value)} placeholder="Ej: Poppins, Inter" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Brand Intelligence</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Deep Research / Contexto del Brand</Label>
            <Textarea
              value={intelligence}
              onChange={e => setIntelligence(e.target.value)}
              placeholder="Pega aquí tu deep research report, análisis de competidores, brand voice guidelines, etc."
              rows={12}
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Guardando..." : brand ? "Actualizar Brand" : "Crear Brand"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
