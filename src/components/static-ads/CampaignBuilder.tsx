import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Brand } from "@/pages/StaticAds";
import type { CustomerProfile } from "./ProfilesPanel";

interface Template { id: string; name: string; image_url: string; }
interface Asset { id: string; name: string; image_url: string; category: string; }
interface CampaignAd { id: string; profile_id: string | null; prompt: string | null; image_url: string | null; status: string; }

export default function CampaignBuilder({ brand }: { brand: Brand }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [cta, setCta] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [adsPerProfile, setAdsPerProfile] = useState("1");
  const [generating, setGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<CampaignAd[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const loadData = useCallback(async () => {
    const [t, a, p] = await Promise.all([
      supabase.from("ad_templates").select("*").eq("brand_id", brand.id),
      supabase.from("brand_assets").select("*").eq("brand_id", brand.id),
      supabase.from("customer_profiles").select("*").eq("brand_id", brand.id),
    ]);
    if (t.data) setTemplates(t.data);
    if (a.data) setAssets(a.data);
    if (p.data) setProfiles(p.data as CustomerProfile[]);
  }, [brand.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleProfile = (id: string) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedProfiles(new Set(profiles.map(p => p.id)));

  const generate = async () => {
    if (!selectedTemplate || !selectedAsset || selectedProfiles.size === 0) {
      toast.error("Selecciona template, asset y al menos un perfil");
      return;
    }

    setGenerating(true);
    setGeneratedAds([]);
    const template = templates.find(t => t.id === selectedTemplate)!;
    const asset = assets.find(a => a.id === selectedAsset)!;
    const targetProfiles = profiles.filter(p => selectedProfiles.has(p.id));
    const count = parseInt(adsPerProfile);
    const totalAds = targetProfiles.length * count;
    setProgress({ current: 0, total: totalAds });

    const { data: campaign, error: campErr } = await supabase.from("campaigns").insert({
      brand_id: brand.id,
      name: `Campaign ${new Date().toLocaleDateString()}`,
      template_id: selectedTemplate,
      asset_id: selectedAsset,
      cta,
      aspect_ratio: aspectRatio,
      status: "generating",
      user_id: user?.id,
    }).select("id").single();

    if (campErr || !campaign) {
      toast.error("Error creando campaña");
      setGenerating(false);
      return;
    }

    const ads: CampaignAd[] = [];

    for (const profile of targetProfiles) {
      for (let i = 0; i < count; i++) {
        try {
          const { data, error } = await supabase.functions.invoke("generate-static-ad", {
            body: {
              brand_name: brand.name,
              brand_description: brand.description,
              brand_intelligence: brand.brand_intelligence,
              template_image_url: template.image_url,
              product_image_url: asset.image_url,
              profile: {
                name: profile.name,
                age_range: profile.age_range,
                pain_points: profile.pain_points,
                desires: profile.desires,
                messaging_angle: profile.messaging_angle,
              },
              cta,
              aspect_ratio: aspectRatio,
            },
          });

          const ad: CampaignAd = {
            id: crypto.randomUUID(),
            profile_id: profile.id,
            prompt: data?.prompt || null,
            image_url: data?.image_url || null,
            status: error || data?.error ? "failed" : "completed",
          };

          await supabase.from("campaign_ads").insert({
            campaign_id: campaign.id,
            profile_id: profile.id,
            prompt: ad.prompt,
            image_url: ad.image_url,
            status: ad.status,
            user_id: user?.id,
          });

          ads.push(ad);
        } catch {
          ads.push({ id: crypto.randomUUID(), profile_id: profile.id, prompt: null, image_url: null, status: "failed" });
        }
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
        setGeneratedAds([...ads]);
      }
    }

    await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
    setGenerating(false);
    toast.success(`${ads.filter(a => a.status === "completed").length}/${totalAds} ads generados`);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">1. Template de Referencia</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                  className={`rounded-lg overflow-hidden border-2 transition-colors ${selectedTemplate === t.id ? "border-primary" : "border-border hover:border-muted-foreground"}`}>
                  <img src={t.image_url} alt={t.name} className="w-full aspect-[4/5] object-cover" />
                </button>
              ))}
              {templates.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sube templates en la pestaña Assets</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">2. Producto (Asset)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {assets.map(a => (
                <button key={a.id} onClick={() => setSelectedAsset(a.id)}
                  className={`rounded-lg overflow-hidden border-2 transition-colors ${selectedAsset === a.id ? "border-primary" : "border-border hover:border-muted-foreground"}`}>
                  <img src={a.image_url} alt={a.name} className="w-full aspect-square object-cover" />
                </button>
              ))}
              {assets.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Sube assets en la pestaña Assets</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">3. Configuración</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">CTA (opcional)</Label>
              <Input value={cta} onChange={e => setCta(e.target.value)} placeholder="Shop Now" />
            </div>
            <div>
              <Label className="text-xs">Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
                  <SelectItem value="9:16">9:16 (Story)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ads por perfil</Label>
              <Select value={adsPerProfile} onValueChange={setAdsPerProfile}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">4. Perfiles Objetivo</CardTitle>
          <Button variant="outline" size="sm" onClick={selectAll}>Seleccionar Todos</Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {profiles.map(p => (
              <label key={p.id} className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-xs transition-colors ${
                selectedProfiles.has(p.id) ? "border-primary bg-primary/5" : "border-border"}`}>
                <Checkbox checked={selectedProfiles.has(p.id)} onCheckedChange={() => toggleProfile(p.id)} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
          {profiles.length === 0 && <p className="text-xs text-muted-foreground">Genera perfiles en la pestaña Customer Profiles</p>}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={generate} disabled={generating} size="lg">
          {generating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando {progress.current}/{progress.total}...</>
          ) : (
            <><ImageIcon className="mr-2 h-4 w-4" /> Generar Ads</>
          )}
        </Button>
      </div>

      {generatedAds.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Ads Generados</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {generatedAds.filter(a => a.image_url).map(ad => {
              const profile = profiles.find(p => p.id === ad.profile_id);
              return (
                <div key={ad.id} className="rounded-lg overflow-hidden border border-border group relative">
                  <img src={ad.image_url!} alt="Generated ad" className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <a href={ad.image_url!} download target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="secondary"><Download className="h-4 w-4" /></Button>
                    </a>
                  </div>
                  {profile && <p className="text-[10px] text-muted-foreground text-center py-1 bg-card">{profile.name}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
