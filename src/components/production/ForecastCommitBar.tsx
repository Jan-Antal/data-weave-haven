import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForecastCommitBarProps {
  totalBlocks: number;
  selectedCount: number;
  inboxBlockCount: number;
  projectBlockCount: number;
  isGenerating: boolean;
  onCommitSelected: () => void;
  onCancel: () => void;
}

export function ForecastCommitBar({
  totalBlocks,
  selectedCount,
  inboxBlockCount,
  projectBlockCount,
  isGenerating,
  onCommitSelected,
  onCancel,
}: ForecastCommitBarProps) {
  if (totalBlocks === 0 && !isGenerating) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between px-6 py-3"
      style={{
        backgroundColor: "#223937",
        borderTop: "1px solid #2a4a46",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4" style={{ color: "#f59e0b" }} />
        <span className="text-sm font-medium" style={{ color: "#a8c5c2" }}>
          {isGenerating ? (
            "Generuji forecast..."
          ) : (
            <>
              <span className="font-bold" style={{ color: "#f59e0b" }}>{totalBlocks}</span>
              {" "}bloků připraveno k zápisu
              {inboxBlockCount > 0 && (
                <span style={{ color: "#22c55e" }}> · {inboxBlockCount} inbox</span>
              )}
              {projectBlockCount > 0 && (
                <span style={{ color: "#f59e0b" }}> · {projectBlockCount} projekt</span>
              )}
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {totalBlocks > 0 && (
          <Button
            size="sm"
            disabled={selectedCount === 0}
            onClick={onCommitSelected}
            className="text-xs font-semibold"
            style={{ backgroundColor: "#3d7a74", color: "#ffffff" }}
          >
            <Check className="h-3 w-3 mr-1" />
            Zapsat vybrané ({selectedCount})
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-xs hover:bg-white/10"
          style={{ color: "#7aa8a4", backgroundColor: "transparent", border: "1px solid #2a4a46" }}
        >
          <X className="h-3 w-3 mr-1" />
          Zrušit
        </Button>
      </div>
    </div>
  );
}
