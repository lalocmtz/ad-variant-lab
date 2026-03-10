import { motion } from "framer-motion";
import { Play, Copy, RefreshCw, Download, FileText, Image as ImageIcon, Video, AlertCircle } from "lucide-react";
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
    image_ready: { label: "Imagen lista", variant: "secondary" },
    video_ready: { label: "Video listo", variant: "secondary" },
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

              {/* Media */}
              <div className="aspect-[9/16] max-h-80 bg-muted relative overflow-hidden">
                {variant.final_video_url ? (
                  <video src={variant.final_video_url} controls className="w-full h-full object-cover" />
                ) : variant.raw_video_url ? (
                  <video src={variant.raw_video_url} controls className="w-full h-full object-cover" />
                ) : variant.generated_image_url ? (
                  variant.generated_image_url.startsWith("data:") ? (
                    <img src={variant.generated_image_url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <img src={variant.generated_image_url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                  )
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

              {/* Visual Prompt (collapsible) */}
              {variant.visual_prompt && (
                <details className="px-4 py-2 border-t border-border">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> Ver prompt visual
                  </summary>
                  <div className="mt-2 relative">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto bg-muted rounded-lg p-2">{variant.visual_prompt}</pre>
                    <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-6 px-2 text-xs" onClick={() => copyToClipboard(variant.visual_prompt, "Prompt visual")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </details>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onRegenerateVariant(idx)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Regenerar
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onDuplicateStyle(idx)}>
                  <Copy className="h-3 w-3 mr-1" /> Duplicar estilo
                </Button>
                {(variant.final_video_url || variant.raw_video_url) && (
                  <Button variant="outline" size="sm" className="text-xs" asChild>
                    <a href={variant.final_video_url || variant.raw_video_url} download target="_blank" rel="noopener">
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
