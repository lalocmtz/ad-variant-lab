import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import BofInputForm from "@/components/bof/BofInputForm";
import BofPipeline from "@/components/bof/BofPipeline";
import BofImageApproval from "@/components/bof/BofImageApproval";
import BofResultsView from "@/components/bof/BofResultsView";
import { useBofPipeline } from "@/hooks/useBofPipeline";

export default function BofVideosPage() {
  const [searchParams] = useSearchParams();
  const {
    step, pipelineStep, statusMessage, isLoading, variants,
    productName, regeneratingScenes,
    handleSubmit, handleApproveScene, handleRegenerateScene,
    handleContinueAfterApproval, handleReset, loadFromHistory,
  } = useBofPipeline();

  // Resume from history via ?resume=<batchId>
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (resumeId && step === "input") {
      loadFromHistory(resumeId);
    }
  }, [searchParams, step, loadFromHistory]);

  return (
    <div className="bg-background">
      <main className="mx-auto max-w-5xl px-8 py-8">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <BofInputForm onSubmit={handleSubmit} isLoading={isLoading} />
          )}
          {(step === "processing" || step === "processing_phase2") && (
            <BofPipeline currentStep={pipelineStep} totalVariants={variants.length || 3} statusMessage={statusMessage} />
          )}
          {step === "approval" && (
            <BofImageApproval
              variants={variants}
              productName={productName}
              onApproveScene={handleApproveScene}
              onRegenerateScene={handleRegenerateScene}
              onContinue={handleContinueAfterApproval}
              regeneratingScenes={regeneratingScenes}
            />
          )}
          {step === "results" && (
            <BofResultsView
              productName={productName}
              variants={variants}
              onReset={handleReset}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
