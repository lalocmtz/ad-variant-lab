import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Brand } from "@/pages/BrandSystemPage";

interface Asset { id: string; name: string; category: string; image_url: string; }
interface Template { id: string; name: string; image_url: string; }

export default function AssetsManager({ brand }: { brand: Brand }) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assetCategory, setAssetCategory] = useState("product_image");
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    const [a, t] = await Promise.all([
      supabase.from("brand_assets").select("*").eq("brand_id", brand.id),
      supabase.from("ad_templates").select("*").eq("brand_id", brand.id),
    ]);
    if (a.data) setAssets(a.data);
    if (t.data) setTemplates(t.data);
  }, [brand.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const uploadFile = async (file: File, type: "asset" | "template") => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `brands/${brand.id}/${type}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(path);

      if (type === "asset") {
        const { error } = await supabase.from("brand_assets").insert({
          brand_id: brand.id,
          name: file.name,
          category: assetCategory,
          image_url: pubUrl.publicUrl,
          storage_path: path,
          user_id: user?.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ad_templates").insert({
          brand_id: brand.id,
          name: file.name,
          image_url: pubUrl.publicUrl,
          storage_path: path,
          user_id: user?.id,
        });
        if (error) throw error;
      }
      toast.success(`${type === "asset" ? "Asset" : "Template"} subido`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "Error subiendo archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, table: "brand_assets" | "ad_templates") => {
    await supabase.from(table).delete().eq("id", id);
    loadData();
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Brand Assets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={assetCategory} onValueChange={setAssetCategory}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product_image">Product Image</SelectItem>
                <SelectItem value="logo">Logo</SelectItem>
                <SelectItem value="lifestyle">Lifestyle</SelectItem>
              </SelectContent>
            </Select>
            <Label className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 transition-colors">
                <Upload className="h-4 w-4" />
                {uploading ? "Subiendo..." : "Subir asset"}
              </div>
              <Input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "asset")} />
            </Label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {assets.map(a => (
              <div key={a.id} className="relative group rounded-lg overflow-hidden border border-border">
                <img src={a.image_url} alt={a.name} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="icon" variant="destructive" onClick={() => handleDelete(a.id, "brand_assets")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <span className="absolute bottom-0 left-0 right-0 bg-background/70 text-[10px] px-1 py-0.5 truncate text-center text-muted-foreground">{a.category}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ad Templates (Referencias)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Label className="block cursor-pointer">
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 transition-colors">
              <Upload className="h-4 w-4" />
              {uploading ? "Subiendo..." : "Subir template de referencia"}
            </div>
            <Input type="file" accept="image/*" className="hidden" disabled={uploading}
              onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "template")} />
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {templates.map(t => (
              <div key={t.id} className="relative group rounded-lg overflow-hidden border border-border">
                <img src={t.image_url} alt={t.name} className="w-full aspect-[4/5] object-cover" />
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="icon" variant="destructive" onClick={() => handleDelete(t.id, "ad_templates")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
