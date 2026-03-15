import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageUploadFieldProps {
  label: string;
  value: string; // URL or empty
  onChange: (url: string) => void;
  required?: boolean;
  bucket?: string;
  prefix?: string;
  className?: string;
  compact?: boolean;
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  required = false,
  bucket = "videos",
  prefix = "upload",
  className = "",
  compact = false,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("La imagen debe ser menor a 20MB");
      return;
    }

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { contentType: file.type, upsert: true });

      if (uploadErr) {
        console.error("ImageUploadField storage error:", uploadErr);
        throw new Error(uploadErr.message);
      }

      const { data: pubUrl } = supabase.storage.from(bucket).getPublicUrl(fileName);
      const publicUrl = pubUrl.publicUrl;

      setPreview(publicUrl);
      onChange(publicUrl);
      toast.success("Imagen subida");
    } catch (err: any) {
      console.error("ImageUploadField error:", err);
      toast.error(`Error subiendo imagen: ${err.message}`);
      setPreview("");
      onChange("");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [bucket, prefix, onChange]);

  const handleRemove = useCallback(() => {
    setPreview("");
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  const size = compact ? "w-20 h-20" : "w-32 h-32";
  const iconSize = compact ? "h-4 w-4" : "h-6 w-6";

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-foreground">
        {label}{required && " *"}
      </label>
      <div className="flex items-start gap-3">
        <div className="relative">
          <label className={`flex flex-col items-center justify-center ${size} border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-foreground/40 transition-colors bg-card overflow-hidden`}>
            {uploading ? (
              <Loader2 className={`${iconSize} animate-spin text-muted-foreground`} />
            ) : preview ? (
              <img src={preview} alt={label} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Upload className={iconSize} />
                <span className="text-[10px]">Subir</span>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
          {preview && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center shadow-sm hover:bg-destructive/90"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
