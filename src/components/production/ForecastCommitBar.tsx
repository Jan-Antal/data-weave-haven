import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForecastCommitBarProps {
  totalBlocks: number;
  selectedCount: number;
  isGenerating: boolean;
  onCommitAll: () => void;
  onCommitSelected: () => void;
  onCancel: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ForecastCommitBar({
  totalBlocks,
  selectedCount,
  isGenerating,
  onCommitAll,
  onCommitSelected,
  onCancel,
  onSelectAll,
  onDeselectAll,
}: ForecastCommitBarProps) {
  if (totalBlocks === 0 && !isGenerating) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between px-6 py-3"
      style={{
        backgroundColor: "#1a1d2e",
        borderTop: "2px solid #f59e0b",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4" style={{ color: "#f59e0b" }} />
        <span className="text-sm font-medium" style={{ color: "#e5e7eb" }}>
          {isGenerating ? (
            "Generuji forecast..."
          ) : (
            <>
              <span className="font-bold" style={{ color: "#f59e0b" }}>{totalBlocks}</span>
              {" "}forecast bloků připraveno
              {selectedCount < totalBlocks && selectedCount > 0 && (
                <span style={{ color: "#9ca3af" }}>
                  {" "}· {selectedCount} vybráno
                </span>
              )}
            </>
          )}
        </span>
        {totalBlocks > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onSelectAll}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: "#9ca3af", backgroundColor: "rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            >
              Vybrat vše
            </button>
            <button
              onClick={onDeselectAll}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: "#9ca3af", backgroundColor: "rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            >
              Odznačit vše
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {totalBlocks > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedCount === 0}
              onClick={onCommitSelected}
              className="text-xs border-amber-600 text-amber-400 hover:bg-amber-900/30 hover:text-amber-300"
              style={{ backgroundColor: "transparent" }}
            >
              <Check className="h-3 w-3 mr-1" />
              Potvrdit vybrané ({selectedCount})
            </Button>
            <Button
              size="sm"
              onClick={onCommitAll}
              className="text-xs font-semibold"
              style={{ backgroundColor: "#f59e0b", color: "#1a1a1a" }}
            >
              <Check className="h-3 w-3 mr-1" />
              Potvrdit vše do Inboxu
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-white hover:bg-white/10"
        >
          <X className="h-3 w-3 mr-1" />
          Zrušit
        </Button>
      </div>
    </div>
  );
}
