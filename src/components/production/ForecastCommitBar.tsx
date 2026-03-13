import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForecastCommitBarProps {
  totalBlocks: number;
  selectedCount: number;
  inboxBlockCount: number;
  projectBlockCount: number;
  isGenerating: boolean;
  allInboxSelected: boolean;
  onCommitSelected: () => void;
  onCancel: () => void;
  onToggleInboxSelect: () => void;
}

export function ForecastCommitBar({
  totalBlocks,
  selectedCount,
  inboxBlockCount,
  projectBlockCount,
  isGenerating,
  allInboxSelected,
  onCommitSelected,
  onCancel,
  onToggleInboxSelect,
}: ForecastCommitBarProps) {
  if (totalBlocks === 0 && !isGenerating) return null;

  const selBtnStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    border: "1px solid #2a4a46",
    color: "#7aa8a4",
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 3,
    cursor: "pointer",
    lineHeight: "18px",
    whiteSpace: "nowrap",
  };

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
        {totalBlocks > 0 && inboxBlockCount > 0 && (
          <button
            onClick={onToggleInboxSelect}
            style={{
              ...selBtnStyle,
              backgroundColor: allInboxSelected ? "rgba(34,197,94,0.15)" : "transparent",
              borderColor: allInboxSelected ? "#22c55e" : "#2a4a46",
              color: allInboxSelected ? "#22c55e" : "#7aa8a4",
            }}
            onMouseEnter={e => {
              if (!allInboxSelected) e.currentTarget.style.backgroundColor = "rgba(122,168,164,0.1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = allInboxSelected ? "rgba(34,197,94,0.15)" : "transparent";
            }}
          >
            {allInboxSelected ? "✓" : "☐"} Inbox ({inboxBlockCount})
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {totalBlocks > 0 && (
          <Button
            size="sm"
            disabled={selectedCount === 0}
            onClick={onCommitSelected}
            className="text-xs font-semibold"
            style={{ backgroundColor: selectedCount === 0 ? "#2a3d3a" : "#3d7a74", color: selectedCount === 0 ? "#4a5a58" : "#ffffff" }}
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
