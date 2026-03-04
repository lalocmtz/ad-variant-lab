import { Button } from "@/components/ui/button";
import { CheckCircle, RotateCcw, Image as ImageIcon } from "lucide-react";

interface CoverPreviewStepProps {
  coverUrl: string;
  productImageUrl: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CoverPreviewStep = ({ coverUrl, productImageUrl, onConfirm, onCancel }: CoverPreviewStepProps) => {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-foreground">Confirma las Referencias</h2>
        <p className="text-sm text-muted-foreground">
          Verifica que el frame del video y la imagen del producto sean correctos antes de generar las variantes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Cover frame */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ImageIcon className="h-4 w-4 text-primary" />
            Frame del Video (Hook)
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover frame del video de TikTok"
                className="aspect-[9/16] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center bg-muted">
                <span className="text-xs text-muted-foreground">No se pudo extraer el frame</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Este frame se usará como referencia de pose, escena y ángulo de cámara.
          </p>
        </div>

        {/* Product image */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ImageIcon className="h-4 w-4 text-primary" />
            Imagen del Producto
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {productImageUrl ? (
              <img
                src={productImageUrl}
                alt="Imagen del producto"
                className="aspect-[9/16] w-full object-contain bg-muted/30"
              />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center bg-muted">
                <span className="text-xs text-muted-foreground">Sin imagen de producto</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Las variantes generadas mostrarán exactamente este producto.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Volver y Cambiar
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1 gap-2 gradient-primary text-primary-foreground hover:opacity-90"
        >
          <CheckCircle className="h-4 w-4" />
          Confirmar y Generar Variantes
        </Button>
      </div>
    </div>
  );
};

export default CoverPreviewStep;
