import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import type { ForecastBlock } from "@/hooks/useForecastMode";
import { getProjectColor } from "@/lib/projectColors";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";

interface ForecastOverlayProps {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  planMode: "respect_plan" | "from_scratch";
}

const CONFIDENCE_BORDER: Record<string, string> = {
  high: "#f59e0b",
  medium: "#f97316",
  low: "#ef4444",
};

export function ForecastOverlay({ blocks, selectedBlockIds, onToggleSelect, planMode }: ForecastOverlayProps) {
  // Group blocks by week
  const blocksByWeek = useMemo(() => {
    const map = new Map<string, ForecastBlock[]>();
    for (const b of blocks) {
      if (!map.has(b.week)) map.set(b.week, []);
      map.get(b.week)!.push(b);
    }
    return map;
  }, [blocks]);

  if (blocks.length === 0) return null;

  return (
    <>
      {Array.from(blocksByWeek.entries()).map(([weekKey, weekBlocks]) => (
        <ForecastWeekBlocks
          key={weekKey}
          weekKey={weekKey}
          blocks={weekBlocks}
          selectedBlockIds={selectedBlockIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </>
  );
}

function ForecastWeekBlocks({
  weekKey,
  blocks,
  selectedBlockIds,
  onToggleSelect,
}: {
  weekKey: string;
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5 mt-2">
      {blocks.map(block => (
        <ForecastCard
          key={block.id}
          block={block}
          isSelected={selectedBlockIds.has(block.id)}
          onToggleSelect={() => onToggleSelect(block.id)}
        />
      ))}
    </div>
  );
}

function ForecastCard({
  block,
  isSelected,
  onToggleSelect,
}: {
  block: ForecastBlock;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const borderColor = CONFIDENCE_BORDER[block.confidence] || "#f59e0b";

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      className="rounded-lg px-2.5 py-2 cursor-pointer transition-all relative"
      style={{
        backgroundColor: "#141a2a",
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor,
        opacity: isSelected ? 1 : 0.6,
        boxShadow: isSelected ? `0 0 0 1px ${borderColor}40` : undefined,
      }}
    >
      {/* AI badge */}
      {block.source === "ai_generated" && (
        <div
          className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded px-1 py-0.5"
          style={{ backgroundColor: "rgba(245,158,11,0.2)", fontSize: 9, color: "#f59e0b", fontWeight: 600 }}
        >
          <Sparkles className="h-2.5 w-2.5" />
          AI
        </div>
      )}

      {/* Checkbox */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-0.5 accent-amber-500"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getProjectColor(block.project_id) }}
            />
            <span
              className="text-[13px] font-semibold truncate"
              style={{ color: "#f0c060" }}
            >
              {block.project_name}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[11px] truncate" style={{ color: "#9ca3af" }}>
              {block.bundle_description}
            </span>
            <span
              className="text-[13px] font-bold shrink-0 ml-2"
              style={{ color: "#f59e0b" }}
            >
              {block.estimated_hours}h
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[9px] font-mono"
              style={{ color: "#6b7280" }}
            >
              {block.project_id}
            </span>
            <span
              className="text-[9px] px-1 rounded"
              style={{
                backgroundColor: block.confidence === "high" ? "rgba(245,158,11,0.15)"
                  : block.confidence === "medium" ? "rgba(249,115,22,0.15)"
                  : "rgba(239,68,68,0.15)",
                color: CONFIDENCE_BORDER[block.confidence],
              }}
            >
              {block.confidence === "high" ? "vysoká" : block.confidence === "medium" ? "střední" : "nízká"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Standalone component to render forecast blocks within a specific week silo */
export function ForecastWeekContent({
  weekKey,
  blocks,
  selectedBlockIds,
  onToggleSelect,
}: {
  weekKey: string;
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const weekBlocks = useMemo(
    () => blocks.filter(b => b.week === weekKey),
    [blocks, weekKey]
  );

  if (weekBlocks.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-1">
      {weekBlocks.map(block => (
        <ForecastCard
          key={block.id}
          block={block}
          isSelected={selectedBlockIds.has(block.id)}
          onToggleSelect={() => onToggleSelect(block.id)}
        />
      ))}
    </div>
  );
}
