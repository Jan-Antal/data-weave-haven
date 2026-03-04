import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MergePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onMerge: () => Promise<void>;
  onKeepSeparate: () => Promise<void>;
}

export function MergePopover({
  open, onOpenChange, itemName, onMerge, onKeepSeparate,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-3">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            Tyto části patří ke stejné položce
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
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>Spojit</div>
              <div className="text-[10px]" style={{ color: "#6b7a78" }}>Sloučit hodiny, ponechat v cílovém týdnu</div>
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
              <div className="text-[11px] font-semibold" style={{ color: "#223937" }}>Ponechat odděleně</div>
              <div className="text-[10px]" style={{ color: "#6b7a78" }}>Přesunout jako samostatnou položku</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
