import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MergePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  mergeItemCount?: number;
  variant?: "split" | "full-bundle";
  targetBundleLabel?: string | null;
  onMerge: () => Promise<void>;
  onKeepSeparate: () => Promise<void>;
}

export function MergePopover({
  open, onOpenChange, itemName, mergeItemCount, variant = "split", targetBundleLabel, onMerge, onKeepSeparate,
}: MergePopoverProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleMerge = useCallback(async () => {
    setSubmitting(true);
    try {
      await onMerge();
      onOpenChange(false);
    } catch {
      // error handled upstream
    }
    setSubmitting(false);
  }, [onMerge, onOpenChange]);

  const handleKeep = useCallback(async () => {
    setSubmitting(true);
    try {
      await onKeepSeparate();
      onOpenChange(false);
    } catch {
      // error handled upstream
    }
    setSubmitting(false);
  }, [onKeepSeparate, onOpenChange]);

  const isBundle = (mergeItemCount ?? 1) > 1;
  const isFullBundleChoice = variant === "full-bundle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-3">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            {isFullBundleChoice
              ? `Vložit do existujícího bundle ${targetBundleLabel || "A"}?`
              : isBundle
              ? `${mergeItemCount} položek má rozdělené části v cílovém týdnu`
              : "Tyto části patří ke stejné položce"}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "#6b7a78" }}>
            {itemName}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2">
          <button
            onClick={handleMerge}
            disabled={submitting}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-left transition-colors"
            style={{ border: "1.5px solid #3a8a36", backgroundColor: "rgba(58,138,54,0.04)" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.04)")}
          >
            <span style={{ fontSize: 12 }}>🔗</span>
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>
                {isFullBundleChoice ? `Vložit do bundle ${targetBundleLabel || "A"}` : isBundle ? `Spojit ${mergeItemCount} položek` : "Spojit"}
              </div>
              <div className="text-[10px]" style={{ color: "#6b7a78" }}>
                {isFullBundleChoice
                  ? "Položky převezmou označení tohoto bundlu"
                  : isBundle
                  ? "Sloučit hodiny všech rozdělených položek"
                  : "Sloučit hodiny, ponechat v cílovém týdnu"}
              </div>
            </div>
          </button>

          <button
            onClick={handleKeep}
            disabled={submitting}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-left transition-colors"
            style={{ border: "1px solid #ece8e2" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <span style={{ fontSize: 12 }}>↔</span>
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>{isFullBundleChoice ? "Přesunout jako nový bundle" : "Ponechat odděleně"}</div>
              <div className="text-[10px]" style={{ color: "#6b7a78" }}>
                {isFullBundleChoice ? "Ponechá vlastní označení v cílovém týdnu" : isBundle ? "Přesunout bundle bez slučování" : "Přesunout jako samostatnou položku"}
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
