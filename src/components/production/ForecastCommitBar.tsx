import { Sparkles, Check, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForecastCommitBarProps {
  totalBlocks: number;
  selectedCount: number;
  inboxBlockCount: number;
  projectBlockCount: number;
  isGenerating: boolean;
  onCommitAll: () => void;
  onCommitSelected: () => void;
  onCommitInboxOnly: () => void;
  onCancel: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ForecastCommitBar({
  totalBlocks,
  selectedCount,
  inboxBlockCount,
  projectBlockCount,
  isGenerating,
  onCommitAll,
  onCommitSelected,
  onCommitInboxOnly,
  onCancel,
  onSelectAll,
  onDeselectAll,
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
              {selectedCount < totalBlocks && selectedCount > 0 && (
                <span style={{ color: "#7aa8a4" }}>
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
              style={{ color: "#a8c5c2", backgroundColor: "rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            >
              Vybrat vše
            </button>
            <button
              onClick={onDeselectAll}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ color: "#a8c5c2", backgroundColor: "rgba(255,255,255,0.05)" }}
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
            {inboxBlockCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={onCommitInboxOnly}
                className="text-xs hover:bg-green-900/30 hover:text-green-300"
                style={{ backgroundColor: "transparent", color: "#22c55e", borderColor: "#2a4a46" }}
              >
                <Inbox className="h-3 w-3 mr-1" />
                Pouze Inbox ({inboxBlockCount})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={selectedCount === 0}
              onClick={onCommitSelected}
              className="text-xs hover:bg-amber-900/30 hover:text-amber-300"
              style={{ backgroundColor: "transparent", color: "#f59e0b", borderColor: "#2a4a46" }}
            >
              <Check className="h-3 w-3 mr-1" />
              Zapsat vybrané ({selectedCount})
            </Button>
            <Button
              size="sm"
              onClick={onCommitAll}
              className="text-xs font-semibold"
              style={{ backgroundColor: "#3d7a74", color: "#ffffff" }}
            >
              <Check className="h-3 w-3 mr-1" />
              Zapsat vše do plánu
            </Button>
          </>
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
