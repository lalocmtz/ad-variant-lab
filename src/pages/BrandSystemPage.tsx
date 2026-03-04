import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BrandSetup from "@/components/static-ads/BrandSetup";

export interface Brand {
  id: string;
  name: string;
  description: string | null;
  colors: any;
  fonts: any;
  brand_intelligence: string | null;
  created_at: string | null;
}

export default function BrandSystemPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);

  const loadBrands = async () => {
    const { data } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
    if (data) {
      setBrands(data);
      if (!activeBrandId && data.length > 0) setActiveBrandId(data[0].id);
    }
  };

  useEffect(() => { loadBrands(); }, []);

  const activeBrand = brands.find(b => b.id === activeBrandId) || null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Brand System</h1>
          <p className="text-sm text-muted-foreground">Setup once, reuse everywhere. Define your brand identity for consistent ad generation.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveBrandId(null)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Brand
          </Button>
        </div>
      </div>

      <BrandSetup
        brand={activeBrand}
        onSaved={(id) => {
          loadBrands();
          setActiveBrandId(id);
        }}
      />
    </div>
  );
}
