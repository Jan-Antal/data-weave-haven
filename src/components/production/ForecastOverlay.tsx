import { useMemo } from "react";
import { Sparkles, Inbox } from "lucide-react";
import type { ForecastBlock, ForecastSource } from "@/hooks/useForecastMode";
import { getProjectColor } from "@/lib/projectColors";
import { useDraggable } from "@dnd-kit/core";

interface ForecastOverlayProps {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  planMode: "respect_plan" | "from_scratch";
}

/** Source-based styling config — exact colors per spec */
function getSourceStyle(source: ForecastSource, _confidence: string) {
  if (source === "inbox_item") {
    return {
      borderColor: "#22c55e",
      borderWidth: 2,
      backgroundColor: "#0a1f10",
      nameColor: "#86efac",
      codeColor: "#3a7a4a",
      badgeLabel: "INBOX",
      badgeBg: "#14532d",
      badgeColor: "#86efac",
      badgeIcon: "inbox" as const,
      hoursColor: "#4ade80",
      hoursPrefix: "",
    };
  }
  if (source === "existing_plan") {
    return {
      borderColor: "#3d4558",
      borderWidth: 1,
      backgroundColor: "#252a35",
      nameColor: "#c8d0e0",
      codeColor: "#5a6480",
      badgeLabel: "",
      badgeBg: "transparent",
      badgeColor: "transparent",
      badgeIcon: null,
      hoursColor: "#8899bb",
      hoursPrefix: "",
    };
  }
  // project_estimate (amber/AI) — Type 3
  return {
    borderColor: "#f59e0b",
    borderWidth: 2,
    backgroundColor: "#1a1200",
    nameColor: "#fcd34d",
    codeColor: "#7a5a00",
    badgeLabel: "AI",
    badgeBg: "#451a03",
    badgeColor: "#fcd34d",
    badgeIcon: "sparkles" as const,
    hoursColor: "#fbbf24",
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
  onContextMenu,
}: {
  block: ForecastBlock;
  isSelected: boolean;
  onToggleSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const style = getSourceStyle(block.source, block.confidence);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `forecast-block-${block.id}`,
    data: {
      type: "forecast-block",
      blockId: block.id,
      projectName: block.project_name,
      hours: block.estimated_hours,
      week: block.week,
      source: block.source,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
      className="rounded-lg px-2.5 py-2 cursor-grab transition-all relative"
      style={{
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        borderStyle: block.source === "existing_plan" ? "solid" : "dashed",
        borderColor: style.borderColor,
        opacity: isDragging ? 0.3 : isSelected ? 1 : 0.55,
        boxShadow: isSelected ? `0 0 0 1px ${style.borderColor}40` : undefined,
      }}
    >
      {/* Badge top-right — only for inbox and AI cards */}
      {style.badgeLabel && (
        <div
          className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: style.badgeBg, fontSize: 10, color: style.badgeColor, fontWeight: 600 }}
        >
          {style.badgeIcon === "sparkles" && <Sparkles className="h-2.5 w-2.5" />}
          {style.badgeIcon === "inbox" && <Inbox className="h-2.5 w-2.5" />}
          {style.badgeLabel}
        </div>
      )}

      {/* Checkbox + content */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-0.5"
          style={{ accentColor: style.borderColor }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
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
            <span className="text-[11px] truncate" style={{ color: style.codeColor }}>
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
              style={{ color: style.codeColor }}
            >
              {block.project_id}
            </span>
            {block.tpv_item_count && block.tpv_item_count > 0 && (
              <span className="text-[9px]" style={{ color: style.codeColor }}>
                · {block.tpv_item_count} pol.
              </span>
            )}
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

/** Merge multiple blocks for the same project into one — mirrors real Kanban bundle grouping */
function mergeBlocksByProject(blocks: ForecastBlock[]): ForecastBlock[] {
  const byProject = new Map<string, ForecastBlock[]>();
  for (const b of blocks) {
    if (!byProject.has(b.project_id)) byProject.set(b.project_id, []);
    byProject.get(b.project_id)!.push(b);
  }
  const merged: ForecastBlock[] = [];
  for (const [, projectBlocks] of byProject) {
    if (projectBlocks.length === 1) {
      merged.push(projectBlocks[0]);
      continue;
    }
    // Determine dominant source: inbox_item > project_estimate > existing_plan
    let source: ForecastSource = "existing_plan";
    if (projectBlocks.some(b => b.source === "inbox_item")) source = "inbox_item";
    else if (projectBlocks.some(b => b.source === "project_estimate")) source = "project_estimate";

    const first = projectBlocks[0];
    merged.push({
      ...first,
      estimated_hours: projectBlocks.reduce((s, b) => s + b.estimated_hours, 0),
      tpv_item_count: projectBlocks.reduce((s, b) => s + (b.tpv_item_count ?? 0), 0),
      source,
      bundle_description: projectBlocks.map(b => b.bundle_description).filter((v, i, a) => a.indexOf(v) === i).join(" + "),
    });
  }
  return merged;
}

/** Standalone component to render already-filtered forecast blocks for one week silo */
export function ForecastWeekContent({
  blocks,
  selectedBlockIds,
  onToggleSelect,
  onForecastContextMenu,
}: {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onForecastContextMenu?: (e: React.MouseEvent, block: ForecastBlock) => void;
}) {
  const mergedBlocks = useMemo(() => mergeBlocksByProject(blocks), [blocks]);

  if (mergedBlocks.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-1">
      {mergedBlocks.map(block => (
        <ForecastCard
          key={block.id}
          block={block}
          isSelected={selectedBlockIds.has(block.id)}
          onToggleSelect={() => onToggleSelect(block.id)}
          onContextMenu={onForecastContextMenu ? (e) => onForecastContextMenu(e, block) : undefined}
        />
      ))}
    </div>
  );
}
