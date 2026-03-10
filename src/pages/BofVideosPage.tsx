import { AnimatePresence } from "framer-motion";
import BofInputForm from "@/components/bof/BofInputForm";
import BofPipeline from "@/components/bof/BofPipeline";
import BofResultsView from "@/components/bof/BofResultsView";
import { useBofPipeline } from "@/hooks/useBofPipeline";

export default function BofVideosPage() {
  const {
    step, pipelineStep, statusMessage, isLoading, variants,
    productName,
    handleSubmit, handleRegenerateVariant, handleDuplicateStyle, handleReset,
  } = useBofPipeline();

  return (
    <div className="bg-background">
      <main className="mx-auto max-w-5xl px-8 py-8">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <BofInputForm onSubmit={handleSubmit} isLoading={isLoading} />
          )}
          {step === "processing" && (
            <BofPipeline currentStep={pipelineStep} totalVariants={variants.length || 3} statusMessage={statusMessage} />
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
