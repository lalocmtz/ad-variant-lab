import { motion } from "framer-motion";
import { Download, FileText, Copy, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { BofVariantResult } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

interface BofResultsViewProps {
  productName: string;
  variants: BofVariantResult[];
  onReset: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    completed: { label: "Completado", variant: "default" },
    failed: { label: "Error", variant: "destructive" },
  };
  const info = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function BofResultsView({ productName, variants, onReset }: BofResultsViewProps) {
  const completedVariants = variants.filter(v => v.status === "completed");
  const failedVariants = variants.filter(v => v.status === "failed");

  const copyScript = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Script copiado");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Videos BOF — {productName}</h2>
          <p className="text-sm text-muted-foreground">
            {completedVariants.length} videos listos
            {failedVariants.length > 0 && ` · ${failedVariants.length} con error`}
          </p>
        </div>
        <Button variant="outline" onClick={onReset}>Nueva generación</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {variants.map((variant, idx) => {
          const format = getFormatById(variant.format_id);
          const primaryVideoUrl = variant.final_merged_url || variant.clip_urls?.[0] || variant.raw_video_url;

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

              {/* Video player */}
              {primaryVideoUrl ? (
                <div className="aspect-[9/16] max-h-[420px] bg-muted overflow-hidden">
                  <video
                    src={primaryVideoUrl}
                    controls
                    className="w-full h-full object-cover rounded-lg"
                    playsInline
                  />
                </div>
              ) : variant.status === "failed" ? (
                <div className="aspect-[9/16] max-h-80 bg-muted flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <span className="text-xs">{variant.error_message || "Error generando video"}</span>
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-80 bg-muted flex items-center justify-center text-muted-foreground">
                  <Play className="h-8 w-8 animate-pulse" />
                </div>
              )}

              {/* Script */}
              {variant.script_text && (
                <div className="px-4 py-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Script
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyScript(variant.script_text)}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{variant.script_text}</p>
                </div>
              )}

              {/* Download */}
              {primaryVideoUrl && variant.status === "completed" && (
                <div className="px-4 py-3 border-t border-border">
                  <Button variant="default" size="sm" className="w-full gap-2" asChild>
                    <a href={primaryVideoUrl} download target="_blank" rel="noopener">
                      <Download className="h-4 w-4" />
                      Descargar video
                    </a>
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
