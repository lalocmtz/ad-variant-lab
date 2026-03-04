import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import AssetsManager from "@/components/static-ads/AssetsManager";
import type { Brand } from "@/pages/BrandSystemPage";

export default function AssetsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
      if (data) {
        setBrands(data);
        if (data.length > 0) setActiveBrandId(data[0].id);
      }
    };
    load();
  }, []);

  const activeBrand = brands.find(b => b.id === activeBrandId) || null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Assets</h1>
          <p className="text-sm text-muted-foreground">Manage product images, logos, and ad templates for your brands.</p>
        </div>
        {brands.length > 0 && (
          <Select value={activeBrandId || ""} onValueChange={setActiveBrandId}>
            <SelectTrigger className="w-[200px] bg-card">
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeBrand ? (
        <AssetsManager brand={activeBrand} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-16 text-center">
          <p className="text-sm text-muted-foreground">Create a brand first to start managing assets.</p>
        </div>
      )}
    </div>
  );
}
