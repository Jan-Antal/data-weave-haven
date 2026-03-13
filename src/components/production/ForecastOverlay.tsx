import { useMemo } from "react";
import { Sparkles, Inbox } from "lucide-react";
import type { ForecastBlock, ForecastSource } from "@/hooks/useForecastMode";
import { getProjectColor } from "@/lib/projectColors";

interface ForecastOverlayProps {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  planMode: "respect_plan" | "from_scratch";
}

/** Source-based styling config */
function getSourceStyle(source: ForecastSource, confidence: string) {
  if (source === "inbox_item") {
    return {
      borderColor: "#22c55e",
      backgroundColor: "#0d1f14",
      nameColor: "#86efac",
      badgeLabel: "INBOX",
      badgeBg: "rgba(34,197,94,0.2)",
      badgeColor: "#22c55e",
      badgeIcon: "inbox" as const,
      hoursColor: "#22c55e",
      hoursPrefix: "",
    };
  }
  if (source === "existing_plan") {
    return {
      borderColor: "#3b82f6",
      backgroundColor: "#0f1520",
      nameColor: "#93c5fd",
      badgeLabel: "PLÁN",
      badgeBg: "rgba(59,130,246,0.2)",
      badgeColor: "#3b82f6",
      badgeIcon: null,
      hoursColor: "#3b82f6",
      hoursPrefix: "",
    };
  }
  // project_estimate (amber/AI)
  return {
    borderColor: confidence === "low" ? "#ef4444" : confidence === "medium" ? "#f97316" : "#f59e0b",
    backgroundColor: "#1a1500",
    nameColor: "#fcd34d",
    badgeLabel: "AI",
    badgeBg: "rgba(245,158,11,0.2)",
    badgeColor: "#f59e0b",
    badgeIcon: "sparkles" as const,
    hoursColor: "#f59e0b",
    hoursPrefix: "~",
  };
}

export function ForecastOverlay({ blocks, selectedBlockIds, onToggleSelect }: ForecastOverlayProps) {
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
  const style = getSourceStyle(block.source, block.confidence);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      className="rounded-lg px-2.5 py-2 cursor-pointer transition-all relative"
      style={{
        backgroundColor: style.backgroundColor,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: style.borderColor,
        opacity: isSelected ? 1 : 0.6,
        boxShadow: isSelected ? `0 0 0 1px ${style.borderColor}40` : undefined,
      }}
    >
      {/* Badge top-right */}
      <div
        className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded px-1 py-0.5"
        style={{ backgroundColor: style.badgeBg, fontSize: 9, color: style.badgeColor, fontWeight: 600 }}
      >
        {style.badgeIcon === "sparkles" && <Sparkles className="h-2.5 w-2.5" />}
        {style.badgeIcon === "inbox" && <Inbox className="h-2.5 w-2.5" />}
        {style.badgeLabel}
      </div>

      {/* Checkbox + content */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-0.5"
          style={{ accentColor: style.borderColor }}
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
              style={{ color: style.nameColor }}
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
              style={{ color: style.hoursColor }}
            >
              {style.hoursPrefix}{block.estimated_hours}h
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
                backgroundColor: block.confidence === "high" ? "rgba(34,197,94,0.15)"
                  : block.confidence === "medium" ? "rgba(249,115,22,0.15)"
                  : "rgba(239,68,68,0.15)",
                color: block.confidence === "high" ? "#22c55e"
                  : block.confidence === "medium" ? "#f97316"
                  : "#ef4444",
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
