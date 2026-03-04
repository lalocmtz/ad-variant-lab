import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Brand } from "@/pages/BrandSystemPage";

export interface CustomerProfile {
  id: string;
  brand_id: string;
  name: string;
  age_range: string | null;
  pain_points: string | null;
  desires: string | null;
  messaging_angle: any;
}

export default function ProfilesPanel({ brand }: { brand: Brand }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [generating, setGenerating] = useState(false);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("customer_profiles").select("*").eq("brand_id", brand.id);
    if (data) setProfiles(data);
  }, [brand.id]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const generateProfiles = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-profiles", {
        body: {
          brand_id: brand.id,
          brand_name: brand.name,
          brand_description: brand.description,
          brand_intelligence: brand.brand_intelligence,
          user_id: user?.id,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`${data.count} perfiles generados`);
      loadProfiles();
    } catch (e: any) {
      toast.error(e.message || "Error generando perfiles");
    } finally {
      setGenerating(false);
    }
  };

  const deleteProfile = async (id: string) => {
    await supabase.from("customer_profiles").delete().eq("id", id);
    loadProfiles();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Customer Profiles ({profiles.length})</h2>
        <Button onClick={generateProfiles} disabled={generating}>
          {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</> : <><Users className="mr-2 h-4 w-4" /> Generar 10 Perfiles</>}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map(p => (
          <Card key={p.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <CardTitle className="text-sm">{p.name}</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => deleteProfile(p.id)} className="h-6 w-6 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              {p.age_range && <p><span className="font-medium text-foreground">Edad:</span> {p.age_range}</p>}
              {p.pain_points && <p><span className="font-medium text-foreground">Pain Points:</span> {p.pain_points}</p>}
              {p.desires && <p><span className="font-medium text-foreground">Deseos:</span> {p.desires}</p>}
              {p.messaging_angle && (
                <p><span className="font-medium text-foreground">Ángulo:</span> {typeof p.messaging_angle === "string" ? p.messaging_angle : JSON.stringify(p.messaging_angle)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {profiles.length === 0 && !generating && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>No hay perfiles aún. Haz clic en "Generar 10 Perfiles" para crear perfiles basados en tu brand.</p>
        </div>
      )}
    </div>
  );
}
