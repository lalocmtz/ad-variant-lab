import { motion } from "framer-motion";
import { Check, RefreshCw, Loader2, ImageIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BofVariantResult } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

interface BofImageApprovalProps {
  variants: BofVariantResult[];
  productName: string;
  onApproveScene: (variantIndex: number, sceneIndex: number) => void;
  onRegenerateScene: (variantIndex: number, sceneIndex: number) => void;
  onContinue: () => void;
  regeneratingScenes: Set<string>; // "vi-si" keys
}

export default function BofImageApproval({
  variants,
  productName,
  onApproveScene,
  onRegenerateScene,
  onContinue,
  regeneratingScenes,
}: BofImageApprovalProps) {
  const allApproved = variants.every(
    (v) =>
      v.status === "failed" ||
      v.scene_images.every((s) => s.approved || !s.image_url || s.clip_status === "failed")
  );

  const approvedCount = variants.reduce(
    (acc, v) => acc + v.scene_images.filter((s) => s.approved).length,
    0
  );
  const totalScenes = variants.reduce(
    (acc, v) => acc + v.scene_images.filter((s) => s.image_url).length,
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Aprobación de escenas — {productName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {approvedCount}/{totalScenes} escenas aprobadas · Revisa y aprueba cada escena antes de animar
          </p>
        </div>
        <Button
          onClick={onContinue}
          disabled={!allApproved}
          className="gap-2"
        >
          Continuar a animación
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Variants grid */}
      <div className="space-y-6">
        {variants.map((variant, vi) => {
          const format = getFormatById(variant.format_id);
          if (variant.status === "failed") return null;

          const variantApproved = variant.scene_images.every(
            (s) => s.approved || !s.image_url || s.clip_status === "failed"
          );

          return (
            <motion.div
              key={variant.id || vi}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: vi * 0.08 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              {/* Variant header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    V{vi + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {format?.format_name || variant.format_id}
                  </span>
                </div>
                {variantApproved ? (
                  <Badge variant="default" className="gap-1">
                    <Check className="h-3 w-3" /> Aprobada
                  </Badge>
                ) : (
                  <Badge variant="outline">Pendiente</Badge>
                )}
              </div>

              {/* Script preview */}
              {variant.script_text && (
                <div className="px-5 py-3 border-b border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Script:</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {variant.script_text}
                  </p>
                </div>
              )}

              {/* Scene images grid */}
              <div className="grid grid-cols-3 gap-3 p-4">
                {variant.scene_images.map((scene, si) => {
                  const key = `${vi}-${si}`;
                  const isRegenerating = regeneratingScenes.has(key);

                  return (
                    <div key={si} className="space-y-2">
                      {/* Scene image */}
                      <div
                        className={`aspect-[9/16] rounded-xl overflow-hidden relative border-2 transition-colors ${
                          scene.approved
                            ? "border-primary"
                            : scene.clip_status === "failed"
                            ? "border-destructive/50"
                            : "border-border"
                        }`}
                      >
                        {scene.image_url ? (
                          <>
                            <img
                              src={scene.image_url}
                              alt={scene.scene_label}
                              className="w-full h-full object-cover"
                            />
                            {scene.approved && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                            {isRegenerating && (
                              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full bg-muted text-muted-foreground">
                            <ImageIcon className="h-6 w-6 mb-1" />
                            <span className="text-[10px]">
                              {scene.clip_status === "failed" ? "Error" : "Sin imagen"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Scene label */}
                      <p className="text-[11px] text-muted-foreground text-center leading-tight truncate px-1">
                        {scene.scene_label}
                      </p>

                      {/* Actions */}
                      {scene.image_url && !isRegenerating && (
                        <div className="flex gap-1.5">
                          <Button
                            variant={scene.approved ? "default" : "outline"}
                            size="sm"
                            className="flex-1 text-[11px] h-7"
                            onClick={() => onApproveScene(vi, si)}
                            disabled={scene.approved}
                          >
                            <Check className="h-3 w-3 mr-0.5" />
                            {scene.approved ? "OK" : "Aprobar"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-[11px] h-7"
                            onClick={() => onRegenerateScene(vi, si)}
                          >
                            <RefreshCw className="h-3 w-3 mr-0.5" />
                            Regenerar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={onContinue}
          disabled={!allApproved}
          size="lg"
          className="gap-2"
        >
          {allApproved
            ? "Animar y generar videos finales"
            : `Aprueba las ${totalScenes - approvedCount} escenas restantes`}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
