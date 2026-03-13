import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Inbox, ChevronRight, GripVertical } from "lucide-react";
import type { ForecastBlock, ForecastSource } from "@/hooks/useForecastMode";
import { getProjectColor } from "@/lib/projectColors";
import { useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";

interface ForecastOverlayProps {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  planMode: "respect_plan" | "from_scratch";
}

/** Source-based styling config — exact colors per spec */
function getSourceStyle(source: ForecastSource, _confidence: string, isMoved = false) {
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
      leftBorder: undefined as string | undefined,
    };
  }
  if (source === "existing_plan") {
    return {
      borderColor: isMoved ? "#f59e0b" : "#3d4558",
      borderWidth: isMoved ? 2 : 1,
      backgroundColor: isMoved ? "#1a1708" : "#252a35",
      nameColor: isMoved ? "#fcd34d" : "#c8d0e0",
      codeColor: isMoved ? "#7a5a00" : "#5a6480",
      badgeLabel: isMoved ? "PŘESUNUTO" : "",
      badgeBg: isMoved ? "#451a03" : "transparent",
      badgeColor: isMoved ? "#fcd34d" : "transparent",
      badgeIcon: isMoved ? ("sparkles" as const) : null,
      hoursColor: isMoved ? "#fbbf24" : "#8899bb",
      hoursPrefix: "",
      leftBorder: isMoved ? "3px solid #f59e0b" : undefined,
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
    leftBorder: undefined as string | undefined,
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

/** Fetched item for expand view */
export interface ForecastSubItem {
  id: string;
  item_name: string;
  item_code: string | null;
  hours: number;
  source: "schedule" | "inbox" | "tpv";
  project_id?: string;
  project_name?: string;
}

/** Draggable sub-item inside an expanded forecast card */
function DraggableForecastSubItem({
  item,
  parentBlock,
  style: s,
}: {
  item: ForecastSubItem;
  parentBlock: ForecastBlock;
  style: ReturnType<typeof getSourceStyle>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `forecast-subitem-${item.id}`,
    data: {
      type: "forecast-subitem",
      subItemId: item.id,
      itemName: item.item_name,
      itemCode: item.item_code,
      hours: item.hours,
      subItemSource: item.source,
      projectId: item.project_id || parentBlock.project_id,
      projectName: item.project_name || parentBlock.project_name,
      parentBlockId: parentBlock.id,
      parentWeek: parentBlock.week,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-[3px] px-[6px] py-[3px] rounded transition-colors cursor-grab group"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${s.borderColor}15`; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: s.codeColor }} />
      {item.item_code && (
        <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: s.codeColor }}>
          {item.item_code}
        </span>
      )}
      <span className="text-[10px] flex-1 truncate" style={{ color: s.nameColor, opacity: 0.8 }}>
        {item.item_name}
      </span>
      {item.hours > 0 && (
        <span className="font-mono text-[9px] shrink-0" style={{ color: s.hoursColor, opacity: 0.7 }}>
          {item.hours}h
        </span>
      )}
    </div>
  );
}

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

type DisplayMode = "hours" | "czk" | "percent";

function ForecastCard({
  block,
  isSelected,
  onToggleSelect,
  onContextMenu,
  onToggleExpand,
  isExpanded,
  displayMode = "hours",
  hourlyRate = 550,
  weeklyCapacity = 0,
}: {
  block: ForecastBlock;
  isSelected: boolean;
  onToggleSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
  displayMode?: DisplayMode;
  hourlyRate?: number;
  weeklyCapacity?: number;
}) {
  const isMoved = block.source === "existing_plan" && !!block.originalWeek && block.week !== block.originalWeek;
  const style = getSourceStyle(block.source, block.confidence, isMoved);
  const [expanded, setExpanded] = useState(false);
  const [subItems, setSubItems] = useState<ForecastSubItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const actualExpanded = isExpanded ?? expanded;
  const toggleExpand = onToggleExpand ?? (() => setExpanded(v => !v));

  // Fetch sub-items when expanded
  useEffect(() => {
    if (!actualExpanded || subItems.length > 0) return;
    let cancelled = false;
    setLoadingItems(true);

    (async () => {
      const items: ForecastSubItem[] = [];

      // Try production_schedule first (for existing_plan blocks)
      if (block.source === "existing_plan") {
        const { data } = await supabase
          .from("production_schedule")
          .select("id, item_name, item_code, scheduled_hours")
          .eq("project_id", block.project_id)
          .eq("scheduled_week", block.week)
          .not("status", "in", '("cancelled")');
        if (data) {
          for (const row of data) {
            items.push({ id: row.id, item_name: row.item_name, item_code: row.item_code, hours: row.scheduled_hours, source: "schedule" });
          }
        }
      }

      // Try production_inbox (for inbox_item blocks)
      if (block.source === "inbox_item") {
        const { data } = await supabase
          .from("production_inbox")
          .select("id, item_name, item_code, estimated_hours")
          .eq("project_id", block.project_id)
          .eq("status", "pending");
        if (data) {
          for (const row of data) {
            items.push({ id: row.id, item_name: row.item_name, item_code: row.item_code, hours: row.estimated_hours, source: "inbox" });
          }
        }
      }

      // For project_estimate or if no items found, try tpv_items
      if (block.source === "project_estimate" || items.length === 0) {
        const { data } = await supabase
          .from("tpv_items")
          .select("id, item_name, item_type, cena")
          .eq("project_id", block.project_id)
          .is("deleted_at", null);
        if (data && data.length > 0 && items.length === 0) {
          for (const row of data) {
            items.push({
              id: row.id,
              item_name: row.item_type || row.item_name,
              item_code: row.item_name,
              hours: row.cena ? Math.round(row.cena / 550) : 0,
              source: "tpv",
            });
          }
        }
      }

      if (!cancelled) {
        setSubItems(items);
        setLoadingItems(false);
      }
    })();

    return () => { cancelled = true; };
  }, [actualExpanded, block.project_id, block.source, block.week, subItems.length]);

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
      className="rounded-lg overflow-hidden transition-all relative"
      style={{
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        borderStyle: block.source === "existing_plan" && !isMoved ? "solid" : "dashed",
        borderColor: style.borderColor,
        borderLeft: style.leftBorder || undefined,
        opacity: isDragging ? 0.3 : isSelected ? 1 : 0.55,
        boxShadow: isSelected ? `0 0 0 1px ${style.borderColor}40` : undefined,
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
    >
      {/* Badge top-right — only for inbox and AI cards */}
      {style.badgeLabel && (
        <div
          className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: style.badgeBg, fontSize: 10, color: style.badgeColor, fontWeight: 600, zIndex: 2 }}
        >
          {style.badgeIcon === "sparkles" && <Sparkles className="h-2.5 w-2.5" />}
          {style.badgeIcon === "inbox" && <Inbox className="h-2.5 w-2.5" />}
          {style.badgeLabel}
        </div>
      )}

      <div className="flex">
        {/* Left: expand/collapse toggle */}
        <div
          className="shrink-0 flex items-center justify-center cursor-pointer select-none"
          style={{ width: 24 }}
          onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          <ChevronRight
            className="shrink-0 transition-transform duration-150"
            style={{ width: 10, height: 10, color: style.codeColor, transform: actualExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
          />
        </div>

        {/* Right: draggable area */}
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="flex-1 min-w-0 px-1.5 py-2 cursor-grab"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
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
                  {style.hoursPrefix}{displayMode === "czk" ? formatCompactCzk(block.estimated_hours * hourlyRate) : displayMode === "percent" ? `${weeklyCapacity > 0 ? Math.round((block.estimated_hours / weeklyCapacity) * 100) : 0}%` : `${block.estimated_hours}h`}
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
                    backgroundColor: block.confidence === "high" ? "rgba(239,68,68,0.15)"
                      : block.confidence === "medium" ? "rgba(249,115,22,0.15)"
                      : "rgba(34,197,94,0.15)",
                    color: block.confidence === "high" ? "#ef4444"
                      : block.confidence === "medium" ? "#f97316"
                      : "#22c55e",
                  }}
                >
                  {block.confidence === "high" ? "vysoká" : block.confidence === "medium" ? "střední" : "nízká"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded items list */}
      {actualExpanded && (
        <div className="px-1.5 py-1" style={{ borderTop: `1px solid ${style.borderColor}40` }}>
          {loadingItems ? (
            <div className="text-[9px] text-center py-1" style={{ color: style.codeColor }}>Načítání...</div>
          ) : subItems.length === 0 ? (
            <div className="text-[9px] text-center py-1" style={{ color: style.codeColor }}>Žádné položky</div>
          ) : (
            subItems.map(item => (
              <DraggableForecastSubItem
                key={item.id}
                item={{ ...item, project_id: block.project_id, project_name: block.project_name }}
                parentBlock={block}
                style={style}
              />
            ))
          )}
        </div>
      )}
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
  expandedIds,
  onToggleExpand,
  displayMode,
  hourlyRate,
  weeklyCapacity,
}: {
  blocks: ForecastBlock[];
  selectedBlockIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onForecastContextMenu?: (e: React.MouseEvent, block: ForecastBlock) => void;
  expandedIds?: Set<string>;
  onToggleExpand?: (blockId: string) => void;
  displayMode?: DisplayMode;
  hourlyRate?: number;
  weeklyCapacity?: number;
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
          isExpanded={expandedIds?.has(block.id)}
          onToggleExpand={onToggleExpand ? () => onToggleExpand(block.id) : undefined}
          displayMode={displayMode}
          hourlyRate={hourlyRate}
          weeklyCapacity={weeklyCapacity}
        />
      ))}
    </div>
  );
}

// ─── Forecast Split Dialog ───
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ForecastSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockName: string;
  totalHours: number;
  currentWeek: string;
  weeks: { key: string; label: string }[];
  onSplit: (keepHours: number, targetWeek: string) => void;
}

export function ForecastSplitDialog({ open, onOpenChange, blockName, totalHours, currentWeek, weeks, onSplit }: ForecastSplitDialogProps) {
  const [keepHours, setKeepHours] = useState(Math.round(totalHours / 2));
  const [targetWeek, setTargetWeek] = useState("");

  useEffect(() => {
    if (open) {
      setKeepHours(Math.round(totalHours / 2));
      setTargetWeek("");
    }
  }, [open, totalHours]);

  const splitHours = totalHours - keepHours;
  const availableWeeks = weeks.filter(w => w.key !== currentWeek);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" style={{ backgroundColor: "#1C1F26", borderColor: "#2a2d35", color: "#e5e5e5" }}>
        <DialogHeader>
          <DialogTitle className="text-amber-400">Rozdělit forecast blok</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-400">{blockName} — celkem {totalHours}h</p>
          <div className="space-y-2">
            <Label className="text-gray-300">Ponechat v tomto týdnu (h)</Label>
            <Input
              type="number"
              min={1}
              max={totalHours - 1}
              value={keepHours}
              onChange={e => setKeepHours(Math.max(1, Math.min(totalHours - 1, Number(e.target.value))))}
              className="bg-[#111318] border-[#2a2d35] text-white"
            />
          </div>
          <p className="text-xs text-gray-500">Přesunout: {splitHours}h</p>
          <div className="space-y-2">
            <Label className="text-gray-300">Cílový týden</Label>
            <Select value={targetWeek} onValueChange={setTargetWeek}>
              <SelectTrigger className="bg-[#111318] border-[#2a2d35] text-white">
                <SelectValue placeholder="Vyberte týden…" />
              </SelectTrigger>
              <SelectContent className="bg-[#1C1F26] border-[#2a2d35]">
                {availableWeeks.map(w => (
                  <SelectItem key={w.key} value={w.key} className="text-gray-200">{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#2a2d35] text-gray-400">Zrušit</Button>
          <Button
            disabled={!targetWeek || splitHours <= 0}
            onClick={() => { onSplit(keepHours, targetWeek); onOpenChange(false); }}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Rozdělit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
