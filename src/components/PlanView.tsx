import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useProjects, Project } from "@/hooks/useProjects";
import { useProjectStages, ProjectStage } from "@/hooks/useProjectStages";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useSortFilter } from "@/hooks/useSortFilter";
import { parseAppDate } from "@/lib/dateFormat";
import { ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { format, differenceInDays, addDays, startOfWeek, startOfMonth, addMonths, getISOWeek } from "date-fns";

// ── Constants ───────────────────────────────────────────────────────
const PHASE_COLORS = {
  konstrukce: "#52b788",
  vyroba: "#f4a261",
  montaz: "#e76f51",
  dokonceno: "#adb5bd",
};

const MILESTONE_COLORS = {
  tpv_date: "#52b788",
  expedice: "#f4a261",
  predani: "#e76f51",
};

const CZECH_MONTHS = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

const ROW_HEIGHT = 48;
const SUBSTAGE_ROW_HEIGHT = 36;
const LEFT_PANEL_WIDTH = 280;
const BAR_HEIGHT = 18;
const SUBSTAGE_BAR_HEIGHT = 10;
const DIAMOND_SIZE = 10;
const OVERLAP_THRESHOLD_DAYS = 4;

type ZoomLevel = "3M" | "6M" | "1R";
const ZOOM_DAY_PX: Record<ZoomLevel, number> = { "3M": 8, "6M": 4, "1R": 2 };
const ZOOM_MONTHS: Record<ZoomLevel, number> = { "3M": 3, "6M": 6, "1R": 12 };

export type { ZoomLevel };

interface PlanViewProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  zoom?: ZoomLevel;
}

// ── Helpers ─────────────────────────────────────────────────────────
function parseDateField(val: string | null | undefined): Date | null {
  if (!val || val.trim() === "") return null;
  const d = parseAppDate(val.trim());
  return d ?? null;
}

function dayOffset(date: Date, origin: Date, dayPx: number): number {
  return differenceInDays(date, origin) * dayPx;
}

function formatMilestoneLabel(d: Date): string {
  return format(d, "dd-MMM").replace(/\./g, "");
}

function weeksLabel(startDate: Date, endDate: Date): string {
  const days = differenceInDays(endDate, startDate);
  const weeks = Math.round(days / 7);
  return weeks > 0 ? `${weeks}t` : "";
}

// ── Milestone validation ────────────────────────────────────────────
interface MilestoneWarning {
  message: string;
}

function validateMilestones(p: { tpv_date?: string | null; expedice?: string | null; predani?: string | null }): MilestoneWarning[] {
  const warnings: MilestoneWarning[] = [];
  const tpv = parseDateField(p.tpv_date);
  const exp = parseDateField(p.expedice);
  const pred = parseDateField(p.predani);

  // Check missing milestones if at least one exists
  const hasAny = tpv || exp || pred;
  if (hasAny) {
    if (!tpv) warnings.push({ message: "Chybí datum TPV" });
    if (!exp) warnings.push({ message: "Chybí datum Expedice" });
    if (!pred) warnings.push({ message: "Chybí datum Předání" });
  }

  // Check order
  if (tpv && exp && exp.getTime() < tpv.getTime()) {
    warnings.push({ message: "Expedice je před TPV" });
  }
  if (exp && pred && pred.getTime() < exp.getTime()) {
    warnings.push({ message: "Předání je před Expedicí" });
  }
  if (tpv && pred && pred.getTime() < tpv.getTime()) {
    warnings.push({ message: "Předání je před TPV" });
  }

  return warnings;
}

// ── Bar data computation ────────────────────────────────────────────
interface Segment {
  start: Date;
  end: Date;
  color: string;
  hatch?: { color1: string; color2: string };
  dashed?: boolean;
}

interface Diamond {
  date: Date;
  color: string;
  label: string;
  name: string;
  yOffset: number;
}

interface BarData {
  segments: Segment[];
  diamonds: Diamond[];
  connectorLine?: { startX: Date; endX: Date };
  hasWarning: boolean;
}

function getProjectBarData(p: Project, statusColorMap: Record<string, string>): BarData {
  const barStart = parseDateField(p.datum_objednavky);
  const barEnd = parseDateField(p.datum_smluvni);
  const tpv = parseDateField(p.tpv_date);
  const expedice = parseDateField(p.expedice);
  const predani = parseDateField(p.predani);

  console.log(`[PlanView] ${p.project_id}: objednavky="${p.datum_objednavky}"→${barStart}, smluvni="${p.datum_smluvni}"→${barEnd}, tpv=${tpv}, exp=${expedice}, pred=${predani}`);

  const warnings = validateMilestones(p);
  const hasWarning = warnings.length > 0;

  const milestoneDates: { key: string; date: Date; color: string; name: string }[] = [];
  if (tpv) milestoneDates.push({ key: "tpv_date", date: tpv, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
  if (expedice) milestoneDates.push({ key: "expedice", date: expedice, color: MILESTONE_COLORS.expedice, name: "Expedice" });
  if (predani) milestoneDates.push({ key: "predani", date: predani, color: MILESTONE_COLORS.predani, name: "Předání" });
  milestoneDates.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Stagger overlapping milestone diamonds
  const diamonds: Diamond[] = milestoneDates.map((m, i, arr) => {
    let yOffset = 0;
    if (i > 0 && Math.abs(differenceInDays(m.date, arr[i - 1].date)) <= OVERLAP_THRESHOLD_DAYS) {
      const offsets = [0, -10, 10];
      yOffset = offsets[i % 3] || 0;
    }
    return {
      date: m.date,
      color: m.color,
      label: formatMilestoneLabel(m.date),
      name: m.name,
      yOffset,
    };
  });

  // Connector line between milestones
  let connectorLine: { startX: Date; endX: Date } | undefined;
  if (milestoneDates.length >= 2) {
    connectorLine = {
      startX: milestoneDates[0].date,
      endX: milestoneDates[milestoneDates.length - 1].date,
    };
  }

  // CASE 1: Both dates exist → full segmented bar
  if (barStart && barEnd) {
    let s = barStart;
    let e = barEnd;
    if (differenceInDays(e, s) < 7) e = addDays(s, 7);

    if (milestoneDates.length === 0) {
      // No milestones → single bar in first phase color
      console.log(`[PlanView] ${p.project_id}: BOTH dates, no milestones, single bar`);
      return { segments: [{ start: s, end: e, color: PHASE_COLORS.konstrukce }], diamonds, connectorLine, hasWarning };
    }

    // Clamp milestones to bar range for segmentation
    const clampedMilestones = milestoneDates.map(m => ({
      ...m,
      date: m.date < s ? s : m.date > e ? e : m.date,
    }));

    const allPoints = [s, ...clampedMilestones.map((m) => m.date), e];
    allPoints.sort((a, b) => a.getTime() - b.getTime());
    const uniquePoints: Date[] = [allPoints[0]];
    for (let i = 1; i < allPoints.length; i++) {
      if (allPoints[i].getTime() !== allPoints[i - 1].getTime()) uniquePoints.push(allPoints[i]);
    }

    const colorSequence = [PHASE_COLORS.konstrukce, PHASE_COLORS.vyroba, PHASE_COLORS.montaz, PHASE_COLORS.dokonceno];
    const segments: Segment[] = [];
    let colorIdx = 0;

    for (let i = 0; i < uniquePoints.length - 1; i++) {
      const segStart = uniquePoints[i];
      const segEnd = uniquePoints[i + 1];
      const color = colorSequence[Math.min(colorIdx, colorSequence.length - 1)];
      const daysBetween = differenceInDays(segEnd, segStart);
      let hatch: { color1: string; color2: string } | undefined;
      if (daysBetween <= OVERLAP_THRESHOLD_DAYS && daysBetween >= 0 && colorIdx > 0) {
        hatch = { color1: colorSequence[Math.min(colorIdx - 1, colorSequence.length - 1)], color2: color };
      }
      segments.push({ start: segStart, end: segEnd, color, hatch });
      if (tpv && segEnd.getTime() === tpv.getTime()) colorIdx = Math.max(colorIdx, 1);
      else if (expedice && segEnd.getTime() === expedice.getTime()) colorIdx = Math.max(colorIdx, 2);
      else if (predani && segEnd.getTime() === predani.getTime()) colorIdx = Math.max(colorIdx, 3);
    }

    console.log(`[PlanView] ${p.project_id}: BOTH dates → ${segments.length} segments`);
    return { segments, diamonds, connectorLine, hasWarning };
  }

  // CASE 2: Only datum_objednavky → dashed bar extending 90 days forward
  if (barStart && !barEnd) {
    const e = addDays(barStart, 90);
    console.log(`[PlanView] ${p.project_id}: ONLY objednavky → dashed bar 90d forward`);
    return { segments: [{ start: barStart, end: e, color: PHASE_COLORS.konstrukce, dashed: true }], diamonds, connectorLine, hasWarning };
  }

  // CASE 3: Only datum_smluvni → dashed bar starting 90 days before
  if (!barStart && barEnd) {
    const s = addDays(barEnd, -90);
    console.log(`[PlanView] ${p.project_id}: ONLY smluvni → dashed bar 90d back`);
    return { segments: [{ start: s, end: barEnd, color: PHASE_COLORS.konstrukce, dashed: true }], diamonds, connectorLine, hasWarning };
  }

  // CASE 4: Neither date exists → no bar, only milestones + connector
  console.log(`[PlanView] ${p.project_id}: NO dates, milestones only`);
  return { segments: [], diamonds, connectorLine, hasWarning };
}

function getStageBarData(stage: ProjectStage, project: Project, statusColorMap: Record<string, string>): BarData {
  const barStart = parseDateField(stage.start_date) ?? parseDateField(stage.datum_smluvni) ?? parseDateField(project.datum_objednavky);
  const barEnd = parseDateField(stage.end_date) ?? parseDateField(project.datum_smluvni);
  const tpv = parseDateField(stage.tpv_date);
  const expedice = parseDateField(stage.expedice);
  const predani = parseDateField(stage.predani);

  const milestoneDates: { date: Date; color: string; name: string }[] = [];
  if (tpv) milestoneDates.push({ date: tpv, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
  if (expedice) milestoneDates.push({ date: expedice, color: MILESTONE_COLORS.expedice, name: "Expedice" });
  if (predani) milestoneDates.push({ date: predani, color: MILESTONE_COLORS.predani, name: "Předání" });
  milestoneDates.sort((a, b) => a.date.getTime() - b.date.getTime());

  const diamonds: Diamond[] = milestoneDates.map((m, i, arr) => {
    let yOffset = 0;
    if (i > 0 && Math.abs(differenceInDays(m.date, arr[i - 1].date)) <= OVERLAP_THRESHOLD_DAYS) {
      yOffset = i % 2 === 1 ? -8 : 8;
    }
    return { date: m.date, color: m.color, label: formatMilestoneLabel(m.date), name: m.name, yOffset };
  });

  let connectorLine: { startX: Date; endX: Date } | undefined;
  if (milestoneDates.length >= 2) {
    connectorLine = { startX: milestoneDates[0].date, endX: milestoneDates[milestoneDates.length - 1].date };
  }

  if (!barStart && !barEnd) return { segments: [], diamonds, connectorLine, hasWarning: false };

  const s = barStart ?? barEnd!;
  const e = barEnd ?? addDays(s, 30);

  if (milestoneDates.length === 0) {
    return { segments: [{ start: s, end: e, color: PHASE_COLORS.konstrukce }], diamonds, connectorLine, hasWarning: false };
  }

  const allPoints = [s, ...milestoneDates.map((m) => m.date), e].sort((a, b) => a.getTime() - b.getTime());
  const colorSequence = [PHASE_COLORS.konstrukce, PHASE_COLORS.vyroba, PHASE_COLORS.montaz, PHASE_COLORS.dokonceno];
  const segments: Segment[] = [];
  let ci = 0;
  for (let i = 0; i < allPoints.length - 1; i++) {
    if (i > 0 && allPoints[i].getTime() === allPoints[i - 1].getTime()) continue;
    segments.push({ start: allPoints[i], end: allPoints[i + 1], color: colorSequence[Math.min(ci, 3)] });
    ci++;
  }

  return { segments, diamonds, connectorLine, hasWarning: false };
}

// ── Milestone Diamond ───────────────────────────────────────────────
function MilestoneDiamond({
  date, color, label, name, origin, dayPx, midY, yOffset, small,
}: {
  date: Date; color: string; label: string; name: string;
  origin: Date; dayPx: number; midY: number; yOffset: number; small?: boolean;
}) {
  const x = dayOffset(date, origin, dayPx);
  const size = small ? 7 : DIAMOND_SIZE;
  const labelAbove = yOffset <= 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute"
            style={{
              left: x - size / 2,
              top: midY - size / 2 + yOffset,
              width: size,
              height: size,
              backgroundColor: color,
              transform: "rotate(45deg)",
              zIndex: 10,
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span className="font-medium">{name}</span>: {format(date, "dd-MMM-yy")}
        </TooltipContent>
      </Tooltip>
      <span
        className="absolute text-[9px] font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: x + size / 2 + 2,
          top: labelAbove ? midY + yOffset - 14 : midY + yOffset + size / 2 + 2,
          color,
          zIndex: 11,
        }}
      >
        {label}
      </span>
    </TooltipProvider>
  );
}

// ── Hatch pattern SVG ───────────────────────────────────────────────
function HatchPattern({ id, color1, color2 }: { id: string; color1: string; color2: string }) {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="4" height="8" fill={color1} />
          <rect x="4" width="4" height="8" fill={color2} />
        </pattern>
      </defs>
    </svg>
  );
}

// ── Warning icon ────────────────────────────────────────────────────
function WarningIcon({ warnings }: { warnings: MilestoneWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#f4a261" }} />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[200px]">
          {warnings.map((w, i) => (
            <div key={i}>{w.message}</div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Connector line between milestones ───────────────────────────────
function ConnectorLine({
  startDate, endDate, origin, dayPx, midY, hasWarning,
}: {
  startDate: Date; endDate: Date; origin: Date; dayPx: number; midY: number; hasWarning: boolean;
}) {
  const x1 = dayOffset(startDate, origin, dayPx);
  const x2 = dayOffset(endDate, origin, dayPx);
  const w = x2 - x1;
  if (w <= 0) return null;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x1,
        top: midY - 1,
        width: w,
        height: 2,
        backgroundColor: hasWarning ? "#f4a261" : "#94a3b8",
        zIndex: 4,
        ...(hasWarning ? {
          backgroundImage: "repeating-linear-gradient(90deg, #f4a261 0px, #f4a261 4px, transparent 4px, transparent 8px)",
          backgroundColor: "transparent",
        } : {}),
      }}
    />
  );
}

// ── Substage loader ─────────────────────────────────────────────────
function SubstageRows({
  projectId, project, origin, dayPx, timelineWidth, statusColorMap,
}: {
  projectId: string; project: Project; origin: Date; dayPx: number;
  timelineWidth: number; statusColorMap: Record<string, string>;
}) {
  const { data: stages = [] } = useProjectStages(projectId);
  if (stages.length === 0) return null;
  return (
    <>
      {stages.map((stage) => (
        <SubstageRow key={stage.id} stage={stage} project={project} origin={origin} dayPx={dayPx} timelineWidth={timelineWidth} statusColorMap={statusColorMap} />
      ))}
    </>
  );
}

function SubstageRow({
  stage, project, origin, dayPx, timelineWidth, statusColorMap,
}: {
  stage: ProjectStage; project: Project; origin: Date; dayPx: number;
  timelineWidth: number; statusColorMap: Record<string, string>;
}) {
  const barData = getStageBarData(stage, project, statusColorMap);
  const midY = SUBSTAGE_ROW_HEIGHT / 2;

  return (
    <div style={{ height: SUBSTAGE_ROW_HEIGHT, position: "relative", width: timelineWidth }}>
      {/* Connector line */}
      {barData.connectorLine && (
        <ConnectorLine
          startDate={barData.connectorLine.startX}
          endDate={barData.connectorLine.endX}
          origin={origin} dayPx={dayPx} midY={midY} hasWarning={false}
        />
      )}
      {barData.segments.map((seg, i) => {
        const x = dayOffset(seg.start, origin, dayPx);
        const w = dayOffset(seg.end, origin, dayPx) - x;
        if (w <= 0) return null;
        const wkLabel = weeksLabel(seg.start, seg.end);
        return (
          <div
            key={i}
            className="absolute rounded-sm"
            style={{
              left: x, top: midY - SUBSTAGE_BAR_HEIGHT / 2,
              width: Math.max(w, 4), height: SUBSTAGE_BAR_HEIGHT,
              backgroundColor: seg.color, opacity: 0.65,
              zIndex: 5,
            }}
          >
            {w > 32 && wkLabel && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white/90 leading-none">{wkLabel}</span>
            )}
          </div>
        );
      })}
      {barData.diamonds.map((m, i) => (
        <MilestoneDiamond key={i} date={m.date} color={m.color} label={m.label} name={m.name} origin={origin} dayPx={dayPx} midY={midY} yOffset={m.yOffset} small />
      ))}
    </div>
  );
}

// ── Substage expand button ──────────────────────────────────────────
function ExpandButton({ projectId, expanded, onClick }: { projectId: string; expanded: boolean; onClick: () => void }) {
  const { data: stages = [] } = useProjectStages(projectId);
  if (stages.length === 0) return <div style={{ width: 20 }} />;
  return (
    <button onClick={onClick} className="p-0 shrink-0">
      {expanded ? <ChevronDown className="h-4 w-4 text-accent stroke-[3]" /> : <ChevronRight className="h-4 w-4 text-accent stroke-[3]" />}
    </button>
  );
}

// ── StatusDot ───────────────────────────────────────────────────────
function StatusDot({ color }: { color: string }) {
  return <div className="shrink-0 rounded-full" style={{ width: 8, height: 8, backgroundColor: color }} />;
}

// ── Main PlanView ───────────────────────────────────────────────────
export function PlanView({ personFilter, statusFilter, search, zoom: zoomProp }: PlanViewProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { sorted } = useSortFilter(projects, { personFilter, statusFilter }, search);
  const zoom = zoomProp ?? ("3M" as ZoomLevel);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const statusColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of statusOptions) m[o.label] = o.color;
    return m;
  }, [statusOptions]);

  const today = useMemo(() => new Date(), []);
  const dayPx = ZOOM_DAY_PX[zoom];
  const monthsHalf = ZOOM_MONTHS[zoom] / 2;

  const timelineStart = useMemo(() => startOfMonth(addMonths(today, -monthsHalf)), [today, monthsHalf]);
  const timelineEnd = useMemo(() => addMonths(today, monthsHalf + 1), [today, monthsHalf]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const timelineWidth = totalDays * dayPx;

  // Month columns
  const months = useMemo(() => {
    const result: { label: string; startX: number; width: number; date: Date }[] = [];
    let d = timelineStart;
    while (d < timelineEnd) {
      const next = addMonths(d, 1);
      const end = next < timelineEnd ? next : timelineEnd;
      const startX = dayOffset(d, timelineStart, dayPx);
      const w = dayOffset(end, timelineStart, dayPx) - startX;
      result.push({ label: CZECH_MONTHS[d.getMonth()], startX, width: w, date: d });
      d = next;
    }
    return result;
  }, [timelineStart, timelineEnd, dayPx]);

  // Week columns — only for 3M and 6M
  const showWeeks = zoom !== "1R";
  const weeks = useMemo(() => {
    if (!showWeeks) return [];
    const result: { label: string; x: number }[] = [];
    let d = startOfWeek(timelineStart, { weekStartsOn: 1 });
    if (d < timelineStart) d = addDays(d, 7);
    while (d < timelineEnd) {
      result.push({ label: `T${getISOWeek(d)}`, x: dayOffset(d, timelineStart, dayPx) });
      d = addDays(d, 7);
    }
    return result;
  }, [timelineStart, timelineEnd, dayPx, showWeeks]);

  const todayX = dayOffset(today, timelineStart, dayPx);

  // Sync scroll
  const handleLeftScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (rightRef.current && leftRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop;
    syncing.current = false;
  }, []);

  const handleRightScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (leftRef.current && rightRef.current) leftRef.current.scrollTop = rightRef.current.scrollTop;
    syncing.current = false;
  }, []);

  useEffect(() => {
    if (rightRef.current) {
      rightRef.current.scrollLeft = Math.max(0, todayX - rightRef.current.clientWidth / 2);
    }
  }, [todayX, zoom]);

  const toggleExpand = (pid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  let hatchCounter = 0;

  // Pre-compute warnings for left panel
  const projectWarnings = useMemo(() => {
    const map: Record<string, MilestoneWarning[]> = {};
    for (const p of sorted) {
      map[p.project_id] = validateMilestones(p);
    }
    return map;
  }, [sorted]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const HEADER_HEIGHT = showWeeks ? 52 : 32;
  const weekFontClass = zoom === "3M" ? "text-[9px] text-muted-foreground/60" : "text-[8px] text-muted-foreground/40";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">

      <div className="flex" style={{ height: "calc(100vh - 340px)", minHeight: 400 }}>
        {/* LEFT PANEL */}
        <div
          ref={leftRef}
          onScroll={handleLeftScroll}
          className="overflow-y-auto overflow-x-hidden border-r shrink-0"
          style={{ width: LEFT_PANEL_WIDTH, scrollbarWidth: "none" }}
        >
          {/* Header */}
          <div style={{ height: HEADER_HEIGHT }} className="border-b bg-muted/20 flex items-end px-3 pb-1 gap-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide" style={{ width: 110, flexShrink: 0 }}>ID</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex-1">Název</span>
          </div>

          {sorted.map((p) => {
            const isExp = expanded.has(p.project_id);
            const statusColor = statusColorMap[p.status || ""] || "#6b7280";
            const warnings = projectWarnings[p.project_id] || [];
            return (
              <div key={p.id}>
                <div
                  className="flex items-center gap-1.5 px-3 border-b hover:bg-muted/30 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(p.project_id); }}
                  >
                    <ExpandButton projectId={p.project_id} expanded={isExp} onClick={() => {}} />
                  </div>
                  <StatusDot color={statusColor} />
                  {warnings.length > 0 && <WarningIcon warnings={warnings} />}
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap" style={{ width: 110, flexShrink: 0 }}>{p.project_id}</span>
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{p.project_name}</span>
                </div>
                {isExp && <SubstageLeftRows projectId={p.project_id} />}
              </div>
            );
          })}
        </div>

        {/* RIGHT PANEL — TIMELINE */}
        <div ref={rightRef} onScroll={handleRightScroll} className="overflow-auto flex-1 relative">
          <div style={{ width: timelineWidth, position: "relative" }}>
            {/* Timeline header */}
            <div className="sticky top-0 z-20 bg-card border-b" style={{ height: HEADER_HEIGHT, position: "relative" }}>
              {/* Month row */}
              <div className="flex" style={{ height: showWeeks ? 28 : HEADER_HEIGHT }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="border-r text-[11px] font-medium text-muted-foreground flex items-center justify-center shrink-0"
                    style={{ width: m.width }}
                  >
                    {m.label} {m.date.getFullYear()}
                  </div>
                ))}
              </div>
              {/* Week row — only for 3M, 6M */}
              {showWeeks && (
                <div className="relative" style={{ height: 24 }}>
                  {weeks.map((w, i) => (
                    <span key={i} className={`absolute font-medium ${weekFontClass}`} style={{ left: w.x + 2, top: 4 }}>
                      {w.label}
                    </span>
                  ))}
                </div>
              )}
              {/* Today label — inside the sticky header */}
              <div className="absolute z-30 text-[9px] font-bold pointer-events-none" style={{ left: todayX, bottom: 2, color: "#e74c3c", transform: "translateX(-50%)" }}>
                Dnes
              </div>
            </div>

            {/* Rows */}
            {sorted.map((p) => {
              const barData = getProjectBarData(p, statusColorMap);
              const isExp = expanded.has(p.project_id);
              const midY = ROW_HEIGHT / 2;

              return (
                <div key={p.id}>
                  <div
                    className="relative border-b hover:bg-muted/10 transition-colors"
                    style={{ height: ROW_HEIGHT, width: timelineWidth }}
                  >
                    {/* Grid lines */}
                    {showWeeks && weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-l border-border/20" style={{ left: w.x }} />
                    ))}
                    {!showWeeks && months.map((m, i) => (
                      <div key={`mg-${i}`} className="absolute top-0 bottom-0 border-l border-border/20" style={{ left: m.startX }} />
                    ))}

                    {/* Connector line between milestones */}
                    {barData.connectorLine && (
                      <ConnectorLine
                        startDate={barData.connectorLine.startX}
                        endDate={barData.connectorLine.endX}
                        origin={timelineStart} dayPx={dayPx} midY={midY}
                        hasWarning={barData.hasWarning}
                      />
                    )}

                    {/* Segments */}
                    {barData.segments.map((seg, i) => {
                      const x = dayOffset(seg.start, timelineStart, dayPx);
                      const w = dayOffset(seg.end, timelineStart, dayPx) - x;
                      const segW = Math.max(w, 4);
                      const wkLabel = weeksLabel(seg.start, seg.end);
                      const hatchId = seg.hatch ? `hatch-${hatchCounter++}` : undefined;
                      const isDashed = seg.dashed;

                      return (
                        <React.Fragment key={`seg-${i}`}>
                          {seg.hatch && hatchId && <HatchPattern id={hatchId} color1={seg.hatch.color1} color2={seg.hatch.color2} />}
                          <div
                            className="absolute rounded-sm"
                            style={{
                              left: x,
                              top: midY - BAR_HEIGHT / 2,
                              width: segW,
                              height: BAR_HEIGHT,
                              backgroundColor: seg.hatch ? undefined : seg.color,
                              background: seg.hatch && hatchId ? `url(#${hatchId})` : undefined,
                              opacity: isDashed ? 0.45 : 1,
                              zIndex: 5,
                              ...(isDashed ? {
                                border: `2px dashed ${seg.color}`,
                                backgroundColor: `${seg.color}33`,
                              } : {}),
                            }}
                          >
                            {segW > 32 && wkLabel && (
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white leading-none drop-shadow-sm">
                                {wkLabel}
                              </span>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {/* Milestone diamonds */}
                    {barData.diamonds.map((m, i) => (
                      <MilestoneDiamond key={i} date={m.date} color={m.color} label={m.label} name={m.name} origin={timelineStart} dayPx={dayPx} midY={midY} yOffset={m.yOffset} />
                    ))}
                  </div>

                  {/* Substage rows */}
                  {isExp && (
                    <SubstageRows projectId={p.project_id} project={p} origin={timelineStart} dayPx={dayPx} timelineWidth={timelineWidth} statusColorMap={statusColorMap} />
                  )}
                </div>
              );
            })}

            {/* Today vertical line */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{ left: todayX, width: 2, backgroundColor: "#e74c3c" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Substage left panel rows ────────────────────────────────────────
function SubstageLeftRows({ projectId }: { projectId: string }) {
  const { data: stages = [] } = useProjectStages(projectId);
  return (
    <>
      {stages.map((stage) => (
        <div key={stage.id} className="flex items-center gap-2 pl-8 pr-3 border-b bg-muted/10" style={{ height: SUBSTAGE_ROW_HEIGHT }}>
          <span className="text-[10px] text-muted-foreground truncate">{stage.stage_name}</span>
        </div>
      ))}
    </>
  );
}
