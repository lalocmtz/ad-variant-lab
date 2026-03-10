import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BofInputForm from "@/components/bof/BofInputForm";
import BofPipeline from "@/components/bof/BofPipeline";
import BofResultsView from "@/components/bof/BofResultsView";
import type { BofFormData, BofVariantResult, BofBatchStatus } from "@/lib/bof_types";
import { getFormatById } from "@/lib/bof_video_formats";

type BofStep = "input" | "processing" | "results";

export default function BofVideosPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<BofStep>("input");
  const [pipelineStep, setPipelineStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [variants, setVariants] = useState<BofVariantResult[]>([]);
  const [productName, setProductName] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);

  const handleSubmit = useCallback(async (formData: BofFormData) => {
    if (!user) { toast.error("Inicia sesión primero"); return; }
    setIsLoading(true);
    setStep("processing");
    setPipelineStep(0);
    setProductName(formData.product_name);

    try {
      // Step 1: Upload product image
      const ext = formData.product_image!.name.split(".").pop() || "png";
      const fileName = `bof_product_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(fileName, formData.product_image!, { contentType: formData.product_image!.type });
      if (uploadErr) throw new Error("Error subiendo imagen del producto");
      const { data: pubUrl } = supabase.storage.from("videos").getPublicUrl(fileName);
      const productImageUrl = pubUrl.publicUrl;

      // Step 2: Create batch record
      const { data: batchData, error: batchErr } = await supabase.from("bof_video_batches").insert([{
        user_id: user.id,
        product_name: formData.product_name,
        product_image_url: productImageUrl,
        metadata_json: {
          current_price: formData.current_price,
          old_price: formData.old_price,
          main_benefit: formData.main_benefit,
          offer: formData.offer,
          pain_point: formData.pain_point,
          audience: formData.audience,
          language: formData.language,
          accent: formData.accent,
        },
        selected_formats: formData.selected_formats,
        status: "generating_scripts",
      }]).select("id").single();
      if (batchErr || !batchData) throw new Error("Error creando batch");
      setBatchId(batchData.id);

      // Step 3: Generate scripts
      setPipelineStep(0);
      const { data: scriptsData, error: scriptsErr } = await supabase.functions.invoke("generate-bof-scripts", {
        body: {
          product_name: formData.product_name,
          product_image_url: productImageUrl,
          current_price: formData.current_price,
          old_price: formData.old_price,
          main_benefit: formData.main_benefit,
          offer: formData.offer,
          pain_point: formData.pain_point,
          audience: formData.audience,
          selected_formats: formData.selected_formats,
          language: formData.language,
          accent: formData.accent,
        },
      });
      if (scriptsErr || scriptsData?.error) throw new Error(scriptsData?.error || scriptsErr?.message || "Error generando scripts");

      const scripts = scriptsData.scripts || [];

      // Create variant records
      const variantInserts = scripts.map((s: any) => ({
        batch_id: batchData.id,
        user_id: user.id,
        format_id: s.format_id,
        script_text: s.script_text,
        status: "script_ready",
      }));
      const { data: variantRows, error: variantErr } = await supabase.from("bof_video_variants").insert(variantInserts).select();
      if (variantErr) throw new Error("Error guardando variantes");

      let currentVariants: BofVariantResult[] = (variantRows || []).map((v: any) => ({
        id: v.id,
        batch_id: v.batch_id,
        format_id: v.format_id,
        format_name: getFormatById(v.format_id)?.format_name || v.format_id,
        script_text: v.script_text,
        visual_prompt: "",
        generated_image_url: "",
        raw_video_url: "",
        voice_audio_url: "",
        final_video_url: "",
        status: "script_ready",
        error_message: "",
      }));
      setVariants([...currentVariants]);

      // Step 4: Generate images for each variant
      setPipelineStep(1);
      for (let i = 0; i < currentVariants.length; i++) {
        const v = currentVariants[i];
        const format = getFormatById(v.format_id);
        try {
          const { data: imgData, error: imgErr } = await supabase.functions.invoke("generate-bof-images", {
            body: {
              product_image_url: productImageUrl,
              product_name: formData.product_name,
              script_text: v.script_text,
              format_id: v.format_id,
              scene_plan: format?.scene_plan,
              camera_rules: format?.camera_rules,
              background_rules: format?.background_rules,
            },
          });
          if (imgErr || imgData?.error) {
            currentVariants[i] = { ...currentVariants[i], status: "failed", error_message: imgData?.error || "Image generation failed" };
          } else {
            currentVariants[i] = {
              ...currentVariants[i],
              generated_image_url: imgData.image_url,
              visual_prompt: imgData.visual_prompt || "",
              status: "image_ready",
            };
          }
        } catch (e: any) {
          currentVariants[i] = { ...currentVariants[i], status: "failed", error_message: e.message };
        }
        setVariants([...currentVariants]);

        // Update DB
        await supabase.from("bof_video_variants").update({
          generated_image_url: currentVariants[i].generated_image_url,
          visual_prompt: currentVariants[i].visual_prompt,
          status: currentVariants[i].status,
          error_message: currentVariants[i].error_message,
        }).eq("id", currentVariants[i].id);
      }

      // Step 5: Generate voice for each variant
      setPipelineStep(3);
      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status === "failed") continue;
        try {
          const voiceResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-bof-voice`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                text: currentVariants[i].script_text,
                language: formData.language,
                accent: formData.accent,
              }),
            }
          );
          if (!voiceResponse.ok) throw new Error(`TTS failed: ${voiceResponse.status}`);
          const audioBlob = await voiceResponse.blob();
          // Upload audio to storage
          const audioFileName = `bof_voice_${Date.now()}_${i}.mp3`;
          const { error: audioUploadErr } = await supabase.storage
            .from("videos")
            .upload(audioFileName, audioBlob, { contentType: "audio/mpeg" });
          if (audioUploadErr) throw new Error("Error uploading voice audio");
          const { data: audioUrl } = supabase.storage.from("videos").getPublicUrl(audioFileName);

          currentVariants[i] = { ...currentVariants[i], voice_audio_url: audioUrl.publicUrl, status: "voice_ready" };
        } catch (e: any) {
          console.error("Voice generation error for variant", i, e);
          // Voice is optional — continue without it
          currentVariants[i] = { ...currentVariants[i], status: "voice_ready" };
        }
        setVariants([...currentVariants]);

        await supabase.from("bof_video_variants").update({
          voice_audio_url: currentVariants[i].voice_audio_url,
          status: currentVariants[i].status,
        }).eq("id", currentVariants[i].id);
      }

      // Mark completed
      for (let i = 0; i < currentVariants.length; i++) {
        if (currentVariants[i].status !== "failed") {
          currentVariants[i] = { ...currentVariants[i], status: "completed" };
        }
      }
      setVariants([...currentVariants]);

      // Update batch status
      await supabase.from("bof_video_batches").update({ status: "completed" }).eq("id", batchData.id);

      // Update all variant statuses
      for (const v of currentVariants) {
        await supabase.from("bof_video_variants").update({ status: v.status }).eq("id", v.id);
      }

      setStep("results");
      toast.success(`${currentVariants.filter(v => v.status === "completed").length} variantes BOF generadas`);
    } catch (e: any) {
      console.error("BOF pipeline error:", e);
      toast.error(e.message || "Error en el pipeline BOF");
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const handleRegenerateVariant = useCallback(async (index: number) => {
    toast.info("Regenerando variante…");
    // For V1, just re-trigger the image generation for this variant
    const variant = variants[index];
    if (!variant) return;

    const updated = [...variants];
    updated[index] = { ...variant, status: "pending", generated_image_url: "", error_message: "" };
    setVariants(updated);

    // We'd need the product image URL from the batch — for now just notify
    toast.info("La regeneración individual estará disponible pronto.");
  }, [variants]);

  const handleDuplicateStyle = useCallback((index: number) => {
    const variant = variants[index];
    if (!variant) return;
    navigator.clipboard.writeText(JSON.stringify({
      format_id: variant.format_id,
      script_text: variant.script_text,
      visual_prompt: variant.visual_prompt,
    }, null, 2));
    toast.success("Estilo copiado al clipboard");
  }, [variants]);

  const handleReset = useCallback(() => {
    setStep("input");
    setVariants([]);
    setBatchId(null);
    setIsLoading(false);
    setPipelineStep(0);
  }, []);

  return (
    <div className="bg-background">
      <main className="mx-auto max-w-5xl px-8 py-8">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <BofInputForm onSubmit={handleSubmit} isLoading={isLoading} />
          )}
          {step === "processing" && (
            <BofPipeline currentStep={pipelineStep} totalVariants={variants.length || 3} />
          )}
          {step === "results" && (
            <BofResultsView
              productName={productName}
              variants={variants}
              onRegenerateVariant={handleRegenerateVariant}
              onDuplicateStyle={handleDuplicateStyle}
              onReset={handleReset}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
