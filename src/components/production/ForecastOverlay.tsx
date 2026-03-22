import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Inbox, ChevronRight, GripVertical } from "lucide-react";
import type { ForecastBlock, ForecastSource, ForecastCalculationDetail } from "@/hooks/useForecastMode";
import { getProjectColor } from "@/lib/projectColors";
import { useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
      hoursPrefix: ""
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
      hoursPrefix: ""
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
    hoursPrefix: "~"
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
      {Array.from(blocksByWeek.entries()).map(([weekKey, weekBlocks]) =>
      <ForecastWeekBlocks
        key={weekKey}
        weekKey={weekKey}
        blocks={weekBlocks}
        selectedBlockIds={selectedBlockIds}
        onToggleSelect={onToggleSelect} />

      )}
    </>);

}

function ForecastWeekBlocks({
  blocks,
  selectedBlockIds,
  onToggleSelect





}: {weekKey: string;blocks: ForecastBlock[];selectedBlockIds: Set<string>;onToggleSelect: (id: string) => void;}) {
  return (
    <div className="space-y-1.5 mt-2">
      {blocks.map((block) =>
      <ForecastCard
        key={block.id}
        block={block}
        isSelected={selectedBlockIds.has(block.id)}
        onToggleSelect={() => onToggleSelect(block.id)} />

      )}
    </div>);

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
  style: s




}: {item: ForecastSubItem;parentBlock: ForecastBlock;style: ReturnType<typeof getSourceStyle>;}) {
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
      parentWeek: parentBlock.week
    }
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-[3px] px-[6px] py-[3px] rounded transition-colors cursor-grab group"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={(e) => {e.currentTarget.style.backgroundColor = `${s.borderColor}15`;}}
      onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = "transparent";}}>
      
      <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: s.codeColor }} />
      {item.item_code &&
      <span className="font-sans text-[9px] font-bold shrink-0" style={{ color: s.codeColor }}>
          {item.item_code}
        </span>
      }
      <span className="text-[10px] flex-1 truncate" style={{ color: s.nameColor, opacity: 0.8 }}>
        {item.item_name}
      </span>
      {item.hours > 0 &&
      <span className="font-sans text-[9px] shrink-0" style={{ color: s.hoursColor, opacity: 0.7 }}>
          {item.hours}h
        </span>
      }
    </div>);

}

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

type DisplayMode = "hours" | "czk" | "percent";

function CalculationTooltipContent({ detail }: { detail: ForecastCalculationDetail }) {
  const baseLabel = detail.base === "tpv_items" ? "Ceny TPV položek" : "Prodejní cena projektu";
  const baseValue = detail.base === "tpv_items"
    ? `TPV suma: ${detail.tpv_sum_czk.toLocaleString("cs-CZ")} Kč`
    : `Prodejní cena: ${detail.prodejni_cena_czk.toLocaleString("cs-CZ")} Kč`;

  return (
    <div className="space-y-1">
      <div className="font-semibold text-amber-400">📊 Výpočet hodin</div>
      <div>Základ: {baseLabel}</div>
      <div>{baseValue}</div>
      <div>Marže: {detail.marze_pct}%</div>
      <div>Výroba: {detail.vyroba_pct}%</div>
      <div>Sazba: {detail.hodinova_sazba} Kč/h</div>
      <div className="border-t border-gray-600 my-1" />
      <div className="text-amber-300">{detail.formula}</div>
    </div>
  );
}

function ForecastCard({
  block,
  isSelected,
  onToggleSelect,
  onContextMenu,
  onToggleExpand,
  isExpanded,
  displayMode = "hours",
  hourlyRate = 550,
  weeklyCapacity = 0










}: {block: ForecastBlock;isSelected: boolean;onToggleSelect: () => void;onContextMenu?: (e: React.MouseEvent) => void;onToggleExpand?: () => void;isExpanded?: boolean;displayMode?: DisplayMode;hourlyRate?: number;weeklyCapacity?: number;}) {
  const style = getSourceStyle(block.source, block.confidence);
  const [expanded, setExpanded] = useState(false);
  const [subItems, setSubItems] = useState<ForecastSubItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const actualExpanded = isExpanded ?? expanded;
  const toggleExpand = onToggleExpand ?? (() => setExpanded((v) => !v));

  // Fetch sub-items when expanded
  useEffect(() => {
    if (!actualExpanded || subItems.length > 0) return;
    let cancelled = false;
    setLoadingItems(true);

    (async () => {
      const items: ForecastSubItem[] = [];

      // Try production_schedule first (for existing_plan blocks)
      if (block.source === "existing_plan") {
        const { data } = await supabase.
        from("production_schedule").
        select("id, item_name, item_code, scheduled_hours").
        eq("project_id", block.project_id).
        eq("scheduled_week", block.week).
        not("status", "in", '("cancelled")');
        if (data) {
          for (const row of data) {
            items.push({ id: row.id, item_name: row.item_name, item_code: row.item_code, hours: row.scheduled_hours, source: "schedule" });
          }
        }
      }

      // Try production_inbox (for inbox_item blocks)
      if (block.source === "inbox_item") {
        const { data } = await supabase.
        from("production_inbox").
        select("id, item_name, item_code, estimated_hours").
        eq("project_id", block.project_id).
        eq("status", "pending");
        if (data) {
          for (const row of data) {
            items.push({ id: row.id, item_name: row.item_name, item_code: row.item_code, hours: row.estimated_hours, source: "inbox" });
          }
        }
      }

      // For project_estimate or if no items found, try tpv_items
      if (block.source === "project_estimate" || items.length === 0) {
        const { data } = await supabase.
        from("tpv_items").
        select("id, item_name, item_type, cena").
        eq("project_id", block.project_id).
        is("deleted_at", null);
        if (data && data.length > 0 && items.length === 0) {
          for (const row of data) {
            items.push({
              id: row.id,
              item_name: row.item_type || row.item_name,
              item_code: row.item_name,
              hours: row.cena ? Math.round(row.cena / (hourlyRate || 550)) : 0,
              source: "tpv"
            });
          }
        }
      }

      if (!cancelled) {
        setSubItems(items);
        setLoadingItems(false);
      }
    })();

    return () => {cancelled = true;};
  }, [actualExpanded, block.project_id, block.source, block.week, subItems.length]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `forecast-block-${block.id}`,
    data: {
      type: "forecast-block",
      blockId: block.id,
      projectName: block.project_name,
      hours: block.estimated_hours,
      week: block.week,
      source: block.source
    }
  });

  return (
    <div
      className="rounded-lg overflow-hidden transition-all relative"
      onContextMenu={(e) => {e.preventDefault();e.stopPropagation();onContextMenu?.(e);}}
      style={{
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        borderStyle: block.source === "existing_plan" ? "solid" : "dashed",
        borderColor: style.borderColor,
        opacity: isDragging ? 0.3 : 1,
        boxShadow: isSelected ? `0 0 0 2px ${style.borderColor}, 0 0 8px ${style.borderColor}30` : undefined
      }}>
      
      {/* Badge top-right — only for inbox and AI cards */}
      {style.badgeLabel &&
      <div
        className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
        style={{ backgroundColor: style.badgeBg, fontSize: 10, color: style.badgeColor, fontWeight: 600, zIndex: 2 }}>
        
          {style.badgeIcon === "sparkles" && <Sparkles className="h-2.5 w-2.5" />}
          {style.badgeIcon === "inbox" && <Inbox className="h-2.5 w-2.5" />}
          {style.badgeLabel}
        </div>
      }

      <div className="flex">
        {/* Left: expand/collapse toggle */}
        <div
          className="shrink-0 flex items-center justify-center cursor-pointer select-none"
          style={{ width: 24 }}
          onClick={(e) => {e.stopPropagation();toggleExpand();}}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}>
          
          <ChevronRight
            className="shrink-0 transition-transform duration-150"
            style={{ width: 10, height: 10, color: style.codeColor, transform: actualExpanded ? "rotate(90deg)" : "rotate(0deg)" }} />
          
        </div>

        {/* Right: draggable area */}
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="flex-1 min-w-0 px-1.5 py-2 cursor-grab"
          onClick={(e) => {e.stopPropagation();onToggleSelect();}}>
          
          {/* Checkbox + content */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="mt-0.5"
              style={{ accentColor: style.borderColor }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 pr-10 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getProjectColor(block.project_id) }} />
                
                <span
                  className="text-[13px] font-semibold truncate"
                  style={{ color: style.nameColor }}>
                  
                  {block.project_name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-[9px] font-sans"
                  style={{ color: style.codeColor }}>
                  {block.project_id}
                </span>
                {/* Deadline inline */}
                {(() => {
                  const srcMap: Record<string, string> = { expedice: "Exp", montaz: "Mnt", predani: "Před", smluvni: "Sml" };
                  if (!block.deadline) {
                    return (
                      <span className="text-[9px] font-medium" style={{ color: "#d97706" }}>
                        ⚠ BEZ TERMÍNU
                      </span>);
                  }
                  const label = srcMap[block.deadline_source ?? ""] ?? "Termín";
                  // Parse ISO date string directly to avoid timezone issues
                  const [y, m, day] = block.deadline.substring(0, 10).split("-");
                  if (!y || !m || !day) return null;
                  const formatted = `${day}.${m}.${y.substring(2)}`;
                  const d = new Date(block.deadline);
                  if (isNaN(d.getTime())) return null;
                  const now = new Date(); now.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
                  const color = diffDays < 0 ? "#DC2626" : diffDays <= 14 ? "#D97706" : diffDays <= 30 ? "#2563EB" : "#7aa8a4";
                  return (
                    <span className="text-[9px] font-medium" style={{ color }}>
                      {label}: {formatted}
                    </span>);
                })()}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] truncate" style={{ color: style.codeColor }}>
                    {block.bundle_description}
                  </span>
                  {block.estimation_level != null && block.source === "project_estimate" && (() => {
                    const level = block.estimation_level!;
                    const bg = level === 1 ? "#14532d" : level <= 3 ? "#451a03" : "#7f1d1d";
                    const color = level === 1 ? "#86efac" : level <= 3 ? "#fcd34d" : "#fca5a5";
                    const label = block.estimation_badge || "odhad";
                    const tooltip = level === 3 ? "Použita výchozí marže 15%" : block.estimation_preset ? `Preset: ${block.estimation_preset}` : undefined;
                    return (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-px text-[8px] font-semibold"
                        style={{ backgroundColor: bg, color }}
                        title={tooltip}
                      >
                        {label}
                      </span>
                    );
                  })()}
                </div>
                {block.calculation_detail && block.source !== "existing_plan" ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="text-[13px] font-bold shrink-0 ml-2 cursor-help"
                          style={{ color: style.hoursColor }}>
                          {style.hoursPrefix}{displayMode === "czk" ? formatCompactCzk(block.estimated_hours * hourlyRate) : displayMode === "percent" ? `${weeklyCapacity > 0 ? Math.round(block.estimated_hours / weeklyCapacity * 100) : 0}%` : `${block.estimated_hours}h`}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs p-3 text-xs font-sans leading-relaxed" style={{ backgroundColor: "#1C1F26", borderColor: "#2a2d35", color: "#e5e5e5" }}>
                        <CalculationTooltipContent detail={block.calculation_detail} />
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span
                    className="text-[13px] font-bold shrink-0 ml-2"
                    style={{ color: style.hoursColor }}>
                    {style.hoursPrefix}{displayMode === "czk" ? formatCompactCzk(block.estimated_hours * hourlyRate) : displayMode === "percent" ? `${weeklyCapacity > 0 ? Math.round(block.estimated_hours / weeklyCapacity * 100) : 0}%` : `${block.estimated_hours}h`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded items list */}
      {actualExpanded &&
      <div className="px-1.5 py-1" style={{ borderTop: `1px solid ${style.borderColor}40` }}>
          {loadingItems ?
        <div className="text-[9px] text-center py-1" style={{ color: style.codeColor }}>Načítání...</div> :
        subItems.length === 0 ?
        <div className="text-[9px] text-center py-1" style={{ color: style.codeColor }}>Žádné položky</div> :

        subItems.map((item) =>
        <DraggableForecastSubItem
          key={item.id}
          item={{ ...item, project_id: block.project_id, project_name: block.project_name }}
          parentBlock={block}
          style={style} />

        )
        }
        </div>
      }
    </div>);

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
    if (projectBlocks.some((b) => b.source === "inbox_item")) source = "inbox_item";else
    if (projectBlocks.some((b) => b.source === "project_estimate")) source = "project_estimate";

    const first = projectBlocks[0];
    merged.push({
      ...first,
      estimated_hours: projectBlocks.reduce((s, b) => s + b.estimated_hours, 0),
      tpv_item_count: projectBlocks.reduce((s, b) => s + (b.tpv_item_count ?? 0), 0),
      source,
      bundle_description: projectBlocks.map((b) => b.bundle_description).filter((v, i, a) => a.indexOf(v) === i).join(" + ")
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
  weeklyCapacity










}: {blocks: ForecastBlock[];selectedBlockIds: Set<string>;onToggleSelect: (id: string) => void;onForecastContextMenu?: (e: React.MouseEvent, block: ForecastBlock) => void;expandedIds?: Set<string>;onToggleExpand?: (blockId: string) => void;displayMode?: DisplayMode;hourlyRate?: number;weeklyCapacity?: number;}) {
  const mergedBlocks = useMemo(() => mergeBlocksByProject(blocks), [blocks]);

  if (mergedBlocks.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-1">
      {mergedBlocks.map((block) =>
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
        weeklyCapacity={weeklyCapacity} />

      )}
    </div>);

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
  weeks: {key: string;label: string;}[];
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
  const availableWeeks = weeks.filter((w) => w.key !== currentWeek);

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
              onChange={(e) => setKeepHours(Math.max(1, Math.min(totalHours - 1, Number(e.target.value))))}
              className="bg-[#111318] border-[#2a2d35] text-white" />
            
          </div>
          <p className="text-xs text-gray-500">Přesunout: {splitHours}h</p>
          <div className="space-y-2">
            <Label className="text-gray-300">Cílový týden</Label>
            <Select value={targetWeek} onValueChange={setTargetWeek}>
              <SelectTrigger className="bg-[#111318] border-[#2a2d35] text-white">
                <SelectValue placeholder="Vyberte týden…" />
              </SelectTrigger>
              <SelectContent className="bg-[#1C1F26] border-[#2a2d35]">
                {availableWeeks.map((w) =>
                <SelectItem key={w.key} value={w.key} className="text-gray-200">{w.label}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#2a2d35] text-gray-400">Zrušit</Button>
          <Button
            disabled={!targetWeek || splitHours <= 0}
            onClick={() => {onSplit(keepHours, targetWeek);onOpenChange(false);}}
            className="bg-amber-600 hover:bg-amber-700 text-white">
            
            Rozdělit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);

}