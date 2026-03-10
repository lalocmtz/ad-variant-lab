import { motion } from "framer-motion";
import { Play, Copy, RefreshCw, Download, FileText, Image as ImageIcon, Video, AlertCircle, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { BofVariantResult } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

interface BofResultsViewProps {
  productName: string;
  variants: BofVariantResult[];
  onRegenerateVariant: (index: number) => void;
  onDuplicateStyle: (index: number) => void;
  onReset: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendiente", variant: "outline" },
    script_ready: { label: "Script listo", variant: "secondary" },
    scenes_ready: { label: "Escenas listas", variant: "secondary" },
    image_ready: { label: "Imágenes listas", variant: "secondary" },
    animating: { label: "Animando…", variant: "secondary" },
    clips_ready: { label: "Clips listos", variant: "secondary" },
    voice_ready: { label: "Voz lista", variant: "secondary" },
    completed: { label: "Completado", variant: "default" },
    failed: { label: "Error", variant: "destructive" },
  };
  const info = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function BofResultsView({ productName, variants, onRegenerateVariant, onDuplicateStyle, onReset }: BofResultsViewProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Resultados BOF — {productName}</h2>
          <p className="text-sm text-muted-foreground">{variants.length} variantes generadas</p>
        </div>
        <Button variant="outline" onClick={onReset}>Nueva generación</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {variants.map((variant, idx) => {
          const format = getFormatById(variant.format_id);
          const hasClips = variant.clip_urls && variant.clip_urls.length > 0;
          const hasSceneImages = variant.scene_images && variant.scene_images.length > 0;

          return (
            <motion.div
              key={variant.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">V{idx + 1}</span>
                  <span className="text-sm font-medium text-foreground">{format?.format_name || variant.format_id}</span>
                </div>
                <StatusBadge status={variant.status} />
              </div>

              {/* Scene clips / images */}
              {hasClips ? (
                <div className="space-y-1">
                  <div className="px-4 pt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Film className="h-3 w-3" /> {variant.clip_urls.length} clips animados
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-2">
                    {variant.clip_urls.map((clipUrl, ci) => (
                      <div key={ci} className="aspect-[9/16] bg-muted rounded-lg overflow-hidden">
                        <video src={clipUrl} controls className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : hasSceneImages ? (
                <div className="space-y-1">
                  <div className="px-4 pt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="h-3 w-3" /> {variant.scene_images.filter(s => s.image_url).length} escenas generadas
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-2">
                    {variant.scene_images.filter(s => s.image_url).map((scene, si) => (
                      <div key={si} className="aspect-[9/16] bg-muted rounded-lg overflow-hidden relative">
                        <img src={scene.image_url} alt={scene.scene_label} className="w-full h-full object-cover" />
                        {scene.clip_status === "completed" && scene.clip_url && (
                          <div className="absolute inset-0">
                            <video src={scene.clip_url} controls className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 text-[9px] bg-background/80 text-foreground px-1 rounded">
                          {scene.clip_status === "completed" ? "✓" : scene.clip_status === "animating" ? "⏳" : scene.clip_status === "failed" ? "✗" : "…"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-80 bg-muted relative overflow-hidden">
                  {variant.generated_image_url ? (
                    <img src={variant.generated_image_url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      {variant.status === "failed" ? (
                        <><AlertCircle className="h-8 w-8 mb-2" /><span className="text-xs">{variant.error_message || "Error"}</span></>
                      ) : (
                        <><ImageIcon className="h-8 w-8 mb-2 animate-pulse" /><span className="text-xs">Generando…</span></>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Voice audio player */}
              {variant.voice_audio_url && (
                <div className="px-4 py-2 border-t border-border">
                  <span className="text-xs text-muted-foreground mb-1 block">🎙️ Locución</span>
                  <audio src={variant.voice_audio_url} controls className="w-full h-8" />
                </div>
              )}

              {/* Script */}
              {variant.script_text && (
                <div className="px-4 py-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Script</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyToClipboard(variant.script_text, "Script")}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{variant.script_text}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onRegenerateVariant(idx)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Regenerar
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onDuplicateStyle(idx)}>
                  <Copy className="h-3 w-3 mr-1" /> Duplicar estilo
                </Button>
                {hasClips && (
                  <Button variant="outline" size="sm" className="text-xs" asChild>
                    <a href={variant.clip_urls[0]} download target="_blank" rel="noopener">
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
