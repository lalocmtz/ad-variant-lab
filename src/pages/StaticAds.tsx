import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import BrandSetup from "@/components/static-ads/BrandSetup";
import AssetsManager from "@/components/static-ads/AssetsManager";
import ProfilesPanel from "@/components/static-ads/ProfilesPanel";
import CampaignBuilder from "@/components/static-ads/CampaignBuilder";

export interface Brand {
  id: string;
  name: string;
  description: string | null;
  colors: any;
  fonts: any;
  brand_intelligence: string | null;
  created_at: string | null;
}

const StaticAds = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [tab, setTab] = useState("brand");

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Static Ads Generator</h1>
        {brands.length > 0 && (
          <Select value={activeBrandId || ""} onValueChange={setActiveBrandId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecciona brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="brand">Brand Setup</TabsTrigger>
          <TabsTrigger value="assets" disabled={!activeBrand}>Assets & Templates</TabsTrigger>
          <TabsTrigger value="profiles" disabled={!activeBrand}>Customer Profiles</TabsTrigger>
          <TabsTrigger value="campaign" disabled={!activeBrand}>Campaign Builder</TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="mt-6">
          <BrandSetup
            brand={activeBrand}
            onSaved={(id) => {
              loadBrands();
              setActiveBrandId(id);
            }}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          {activeBrand && <AssetsManager brand={activeBrand} />}
        </TabsContent>

        <TabsContent value="profiles" className="mt-6">
          {activeBrand && <ProfilesPanel brand={activeBrand} />}
        </TabsContent>

        <TabsContent value="campaign" className="mt-6">
          {activeBrand && <CampaignBuilder brand={activeBrand} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StaticAds;
