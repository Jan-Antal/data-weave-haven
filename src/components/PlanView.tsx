import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { PlanDateEditDialog } from "@/components/PlanDateEditDialog";
import { useProjects, Project } from "@/hooks/useProjects";
import { useProjectStages, ProjectStage } from "@/hooks/useProjectStages";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useAuth } from "@/hooks/useAuth";
import { useSortFilter } from "@/hooks/useSortFilter";
import { parseAppDate, formatAppDate } from "@/lib/dateFormat";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { ChevronRight, ChevronDown, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { format, differenceInDays, addDays, startOfWeek, startOfMonth, addMonths, getISOWeek } from "date-fns";

// ── Constants ───────────────────────────────────────────────────────
const PHASE_COLORS = {
  konstrukce: "#52b788",
  vyroba: "#f4a261",
  montaz: "#e76f51",
  dokonceno: "#adb5bd",
  overdue: "#dc2626",
};

const MILESTONE_COLORS = {
  tpv_date: "#52b788",
  expedice: "#f4a261",
  predani: "#e76f51",
};

const PHASE_COLORS_LIGHT = {
  konstrukce: "#a8d5b5",
  vyroba: "#f9c89a",
  montaz: "#f2a993",
  dokonceno: "#d6dadd",
  overdue: "#ef4444",
};

const MILESTONE_COLORS_SOLID = {
  tpv_date: "#52b788",
  expedice: "#f4a261",
  predani: "#e76f51",
};

const PHASE_LABELS: Record<string, string> = {
  [PHASE_COLORS.konstrukce]: "Konstrukce",
  [PHASE_COLORS.vyroba]: "Výroba",
  [PHASE_COLORS.montaz]: "Montáž",
  [PHASE_COLORS.overdue]: "Po termínu",
  [PHASE_COLORS_LIGHT.konstrukce]: "Konstrukce",
  [PHASE_COLORS_LIGHT.vyroba]: "Výroba",
  [PHASE_COLORS_LIGHT.montaz]: "Montáž",
  [PHASE_COLORS_LIGHT.overdue]: "Po termínu",
};

const CZECH_MONTHS = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

const CZECH_MONTHS_SHORT = [
  "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn",
  "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
];

const ROW_HEIGHT = 48;
const SUBSTAGE_ROW_HEIGHT = 36;
const LEFT_PANEL_WIDTH = 280;
const BAR_HEIGHT = 16;
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
  fields?: string[]; // which field keys are involved
}

// Expected order: datum_objednavky < tpv_date < expedice < predani < datum_smluvni
const ORDER_PAIRS: { before: string; after: string; beforeLabel: string; afterLabel: string }[] = [
  { before: "datum_objednavky", after: "tpv_date", beforeLabel: "Datum Objednání", afterLabel: "TPV" },
  { before: "datum_objednavky", after: "expedice", beforeLabel: "Datum Objednání", afterLabel: "Expedice" },
  { before: "datum_objednavky", after: "predani", beforeLabel: "Datum Objednání", afterLabel: "Předání" },
  { before: "datum_objednavky", after: "datum_smluvni", beforeLabel: "Datum Objednání", afterLabel: "Datum Smluvní" },
  { before: "tpv_date", after: "expedice", beforeLabel: "TPV", afterLabel: "Expedice" },
  { before: "tpv_date", after: "predani", beforeLabel: "TPV", afterLabel: "Předání" },
  { before: "tpv_date", after: "datum_smluvni", beforeLabel: "TPV", afterLabel: "Datum Smluvní" },
  { before: "expedice", after: "predani", beforeLabel: "Expedice", afterLabel: "Předání" },
  { before: "expedice", after: "datum_smluvni", beforeLabel: "Expedice", afterLabel: "Datum Smluvní" },
  { before: "predani", after: "datum_smluvni", beforeLabel: "Předání", afterLabel: "Datum Smluvní" },
];

function getOrderWarnings(dateMap: Record<string, Date | null>): MilestoneWarning[] {
  const warnings: MilestoneWarning[] = [];
  for (const pair of ORDER_PAIRS) {
    const d1 = dateMap[pair.before];
    const d2 = dateMap[pair.after];
    if (d1 && d2 && d2 < d1) {
      warnings.push({
        message: `${pair.afterLabel} je před ${pair.beforeLabel}`,
        fields: [pair.before, pair.after],
      });
    }
  }
  return warnings;
}

// Exported for use in the popup dialog
export function getFieldOrderWarnings(values: Record<string, string | null>): Record<string, string[]> {
  const dateMap: Record<string, Date | null> = {};
  for (const key of Object.keys(values)) {
    const v = values[key];
    dateMap[key] = v ? (parseAppDate(v.trim()) ?? null) : null;
  }
  const warnings = getOrderWarnings(dateMap);
  const fieldWarnings: Record<string, string[]> = {};
  for (const w of warnings) {
    for (const f of w.fields ?? []) {
      if (!fieldWarnings[f]) fieldWarnings[f] = [];
      fieldWarnings[f].push(w.message);
    }
  }
  return fieldWarnings;
}

function getBarWarnings(
  S: Date | null, E: Date | null,
  TPV: Date | null, EXP: Date | null, PRE: Date | null,
): MilestoneWarning[] {
  const warnings: MilestoneWarning[] = [];
  if (!S && E) {
    warnings.push({ message: "Chybí datum objednávky a milníky" });
    return warnings;
  }
  if (!S || !E) return warnings;

  const hasTPV = !!TPV;
  const hasEXP = !!EXP;

  if (!hasTPV && !hasEXP) {
    warnings.push({ message: "Chybí milníky TPV a Expedice" });
  } else if (!hasTPV) {
    warnings.push({ message: "Chybí milník TPV" });
  } else if (!hasEXP) {
    warnings.push({ message: "Chybí milník Expedice" });
  }

  // Order warnings
  const dateMap: Record<string, Date | null> = {
    datum_objednavky: S, tpv_date: TPV, expedice: EXP, predani: PRE, datum_smluvni: E,
  };
  const orderWarnings = getOrderWarnings(dateMap);
  warnings.push(...orderWarnings);

  return warnings;
}

// ── Bar data computation ────────────────────────────────────────────
interface Segment {
  start: Date;
  end: Date;
  color: string;
  hatchColors?: [string, string]; // diagonal stripe pattern for out-of-order milestones
}

interface Diamond {
  date: Date;
  color: string;
  label: string;
  name: string;
  priority: number; // higher = renders on top (Předání=3 > Expedice=2 > TPV=1)
  fieldKey?: string; // database field key for saving drag changes
}

const DRAGGABLE_MILESTONES = new Set(["TPV", "Expedice", "Předání"]);
const MILESTONE_FIELD_MAP: Record<string, string> = { "TPV": "tpv_date", "Expedice": "expedice", "Předání": "predani" };

interface BarData {
  segments: Segment[];
  diamonds: Diamond[];
  connectorLine?: { startX: Date; endX: Date };
  hasWarning: boolean;
  warnings: MilestoneWarning[];
}

const MILESTONE_PRIORITY: Record<string, number> = { "TPV": 1, "Expedice": 2, "Předání": 3 };

function makeDiamonds(items: { date: Date; color: string; name: string }[]): Diamond[] {
  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted.map((m) => ({
    date: m.date,
    color: m.color,
    label: formatMilestoneLabel(m.date),
    name: m.name,
    priority: MILESTONE_PRIORITY[m.name] ?? 0,
    fieldKey: MILESTONE_FIELD_MAP[m.name],
  }));
}



function getBarDataFromFields(
  datumObjednavky: string | null | undefined,
  datumSmluvni: string | null | undefined,
  tpvDate: string | null | undefined,
  expedice: string | null | undefined,
  predani: string | null | undefined,
  _statusColorMap: Record<string, string>,
  phaseColors = PHASE_COLORS,
  milestoneColors = MILESTONE_COLORS,
): BarData {
  const S = parseDateField(datumObjednavky);
  const E = parseDateField(datumSmluvni);
  const TPV = parseDateField(tpvDate);
  const EXP = parseDateField(expedice);
  const PRE = parseDateField(predani);

  const warnings = getBarWarnings(S, E, TPV, EXP, PRE);
  const hasWarning = warnings.length > 0;

  const empty: BarData = { segments: [], diamonds: [], hasWarning, warnings };

  if (!E) return empty;

  const dItems: { date: Date; color: string; name: string }[] = [];

  // CASE 1 — no start date
  if (!S) {
    dItems.push({ date: E, color: milestoneColors.predani, name: "Předání" });
    return { ...empty, diamonds: makeDiamonds(dItems) };
  }

  const safeE = differenceInDays(E, S) < 7 ? addDays(S, 7) : E;

  // Compute the latest date across all milestones + safeE
  const allDates = [safeE];
  if (TPV) allDates.push(TPV);
  if (EXP) allDates.push(EXP);
  if (PRE) allDates.push(PRE);
  const latestDate = allDates.reduce((a, b) => (a > b ? a : b));
  const hasOverdue = latestDate > safeE;

  // Build milestone diamonds
  if (TPV) dItems.push({ date: TPV, color: milestoneColors.tpv_date, name: "TPV" });
  if (EXP) dItems.push({ date: EXP, color: milestoneColors.expedice, name: "Expedice" });
  if (PRE) dItems.push({ date: PRE, color: milestoneColors.predani, name: "Předání" });

  // Build segments up to safeE using available milestones (capped at safeE)
  const milestonesCapped: Date[] = [];
  if (TPV && TPV <= safeE) milestonesCapped.push(TPV);
  if (EXP && EXP <= safeE) milestonesCapped.push(EXP);
  if (PRE && PRE <= safeE) milestonesCapped.push(PRE);
  milestonesCapped.sort((a, b) => a.getTime() - b.getTime());

  const colorSeq = [phaseColors.konstrukce, phaseColors.vyroba, phaseColors.montaz, phaseColors.dokonceno];
  const pts = [S, ...milestonesCapped, safeE];
  // Deduplicate consecutive equal dates
  const uniquePts: Date[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].getTime() !== pts[i - 1].getTime()) uniquePts.push(pts[i]);
  }

  const segs: Segment[] = [];
  for (let i = 0; i < uniquePts.length - 1; i++) {
    const w = differenceInDays(uniquePts[i + 1], uniquePts[i]);
    if (w <= 0) continue;
    segs.push({ start: uniquePts[i], end: uniquePts[i + 1], color: colorSeq[Math.min(i, colorSeq.length - 1)] });
  }

  // If no milestones before safeE and we have none, show a single dokonceno bar
  if (segs.length === 0 && differenceInDays(safeE, S) > 0) {
    segs.push({ start: S, end: safeE, color: phaseColors.dokonceno });
  }

  // Add overdue segment (red/orange) if milestones exceed safeE
  if (hasOverdue) {
    segs.push({ start: safeE, end: latestDate, color: phaseColors.overdue });
  }

  return { segments: segs, diamonds: makeDiamonds(dItems), hasWarning, warnings };
}

function getProjectBarData(p: Project, statusColorMap: Record<string, string>): BarData {
  return getBarDataFromFields(p.datum_objednavky, p.datum_smluvni, p.tpv_date, p.expedice, p.predani, statusColorMap);
}

function getStageBarData(stage: ProjectStage, project: Project, statusColorMap: Record<string, string>): BarData {
  const datumObjednavky = stage.start_date ?? project.datum_objednavky;
  const datumSmluvni = stage.end_date ?? stage.datum_smluvni ?? project.datum_smluvni;
  return getBarDataFromFields(datumObjednavky, datumSmluvni, stage.tpv_date, stage.expedice, stage.predani, statusColorMap, PHASE_COLORS_LIGHT, MILESTONE_COLORS_SOLID);
}

// ── Milestone Diamond ───────────────────────────────────────────────
function MilestoneDiamond({
  date, color, label, name, origin, dayPx, midY, small, showLabel, zIndex,
  draggable, onDragEnd,
}: {
  date: Date; color: string; label: string; name: string;
  origin: Date; dayPx: number; midY: number; small?: boolean;
  showLabel?: boolean; zIndex?: number;
  draggable?: boolean;
  onDragEnd?: (newDate: Date) => void;
}) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStartX = useRef<number>(0);
  const originalX = useRef<number>(0);

  const baseX = dayOffset(date, origin, dayPx);
  const currentX = dragOffset !== null ? baseX + dragOffset : baseX;
  const size = small ? 8 : 12;
  const isDraggable = draggable && !!onDragEnd;

  const dragDate = useMemo(() => {
    if (dragOffset === null) return null;
    const daysDelta = Math.round(dragOffset / dayPx);
    return addDays(date, daysDelta);
  }, [dragOffset, dayPx, date]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isDraggable) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartX.current = e.clientX;
    originalX.current = baseX;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - dragStartX.current;
      setDragOffset(delta);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      const delta = ev.clientX - dragStartX.current;
      const daysDelta = Math.round(delta / dayPx);
      if (daysDelta !== 0) {
        const newDate = addDays(date, daysDelta);
        onDragEnd?.(newDate);
      }
      setDragOffset(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [isDraggable, baseX, dayPx, date, onDragEnd]);

  const diamondStyle: React.CSSProperties = {
    left: currentX - size / 2,
    top: midY - size / 2,
    width: size,
    height: size,
    backgroundColor: color,
    transform: "rotate(45deg)",
    zIndex: dragOffset !== null ? 50 : (zIndex ?? 10),
    cursor: isDraggable ? (dragOffset !== null ? "grabbing" : "grab") : "default",
    transition: dragOffset !== null ? "none" : undefined,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute"
            style={diamondStyle}
            onMouseDown={handleMouseDown}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {dragOffset !== null && dragDate ? (
            <span className="font-medium">{name}: {format(dragDate, "dd-MMM-yy")}</span>
          ) : (
            <>
              <span className="font-medium">{name}</span>: {format(date, "dd-MMM-yy")}
              {!isDraggable && <Lock className="inline-block h-3 w-3 ml-1 opacity-50" />}
            </>
          )}
        </TooltipContent>
      </Tooltip>
      {(showLabel !== false) && (
        <span
          className="absolute text-[9px] font-medium whitespace-nowrap pointer-events-none"
          style={{
            left: currentX,
            top: 0,
            transform: "translateX(-50%)",
            color,
            zIndex: (zIndex ?? 10) + 1,
          }}
        >
          {dragOffset !== null && dragDate ? format(dragDate, "dd-MMM").replace(/\./g, "") : label}
        </span>
      )}
    </TooltipProvider>
  );
}

// ── Hatch pattern helper ─────────────────────────────────────────────
function hatchBackground(color1: string, color2: string): string {
  return `repeating-linear-gradient(
    45deg,
    ${color1} 0px, ${color1} 4px,
    ${color2} 4px, ${color2} 8px
  )`;
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
          origin={origin} dayPx={dayPx} midY={midY} hasWarning={barData.hasWarning}
        />
      )}
      {barData.segments.map((seg, i) => {
        const x = dayOffset(seg.start, origin, dayPx);
        const w = dayOffset(seg.end, origin, dayPx) - x;
        if (w <= 0) return null;
        const wkLabel = weeksLabel(seg.start, seg.end);
        const phaseLabel = PHASE_LABELS[seg.color];
        const hasHatch = !!seg.hatchColors;
        const segDiv = (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x, top: midY - SUBSTAGE_BAR_HEIGHT / 2,
              width: Math.max(w, 4), height: SUBSTAGE_BAR_HEIGHT,
              background: hasHatch ? hatchBackground(seg.hatchColors![0], seg.hatchColors![1]) : seg.color,
              zIndex: 2, borderRadius: 4,
            }}
          >
            {w > 32 && wkLabel && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white/90 leading-none">{wkLabel}</span>
            )}
          </div>
        );
        if (!phaseLabel) return segDiv;
        return (
          <TooltipProvider key={i} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>{segDiv}</TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{phaseLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      {barData.diamonds.map((m, i, arr) => {
        // Hide label if a later diamond is within 5 days
        const showLabel = !arr.some((other, j) => j > i && Math.abs(differenceInDays(other.date, m.date)) <= 5);
        return (
          <MilestoneDiamond key={i} date={m.date} color={m.color} label={m.label} name={m.name} origin={origin} dayPx={dayPx} midY={midY} small showLabel={showLabel} zIndex={10 + m.priority} />
        );
      })}
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
  const { getLabel } = useColumnLabels("project-info");
  const planIdLabel = getLabel("project_id", "ID");
  const planNameLabel = getLabel("project_name", "Název");
  const { sorted: filteredProjects } = useSortFilter(projects, { personFilter, statusFilter }, search);
  const zoom = zoomProp ?? ("3M" as ZoomLevel);
  const [planSortCol, setPlanSortCol] = useState<string | null>(null);
  const [planSortDir, setPlanSortDir] = useState<"asc" | "desc" | null>(null);

  const togglePlanSort = useCallback((col: string) => {
    if (planSortCol !== col) { setPlanSortCol(col); setPlanSortDir("asc"); }
    else if (planSortDir === "asc") setPlanSortDir("desc");
    else { setPlanSortCol(null); setPlanSortDir(null); }
  }, [planSortCol, planSortDir]);

  const sorted = useMemo(() => {
    if (!planSortCol || !planSortDir) return filteredProjects;
    return [...filteredProjects].sort((a, b) => {
      const va = ((a as any)[planSortCol] ?? "").toString().toLowerCase();
      const vb = ((b as any)[planSortCol] ?? "").toString().toLowerCase();
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return planSortDir === "desc" ? -cmp : cmp;
    });
  }, [filteredProjects, planSortCol, planSortDir]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState(0);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const updateProject = useUpdateProject();
  const { isFieldReadOnly } = useAuth();

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const timelineHeaderRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const statusColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of statusOptions) m[o.label] = o.color;
    return m;
  }, [statusOptions]);

  const today = useMemo(() => new Date(), []);

  // For 1R: measure container width and compute dayPx to fit 12 months
  useEffect(() => {
    if (rightRef.current) {
      const w = rightRef.current.clientWidth;
      setContainerWidth(w);
    }
  }, [zoom]);

  const monthsHalf = ZOOM_MONTHS[zoom] / 2;
  const timelineStart = useMemo(() => startOfMonth(addMonths(today, -monthsHalf)), [today, monthsHalf]);

  // For 3M/6M: extend end to cover all project dates
  const maxProjectDate = useMemo(() => {
    if (zoom === "1R") return null;
    let max: Date | null = null;
    for (const p of sorted) {
      const fields = [p.datum_smluvni, p.datum_objednavky, p.tpv_date, p.expedice, p.predani];
      for (const f of fields) {
        const d = parseDateField(f);
        if (d && (!max || d > max)) max = d;
      }
    }
    return max;
  }, [sorted, zoom]);

  const timelineEnd = useMemo(() => {
    const defaultEnd = addMonths(today, monthsHalf + 1);
    if ((zoom === "3M" || zoom === "6M") && maxProjectDate && maxProjectDate > defaultEnd) {
      return addMonths(startOfMonth(maxProjectDate), 2);
    }
    return defaultEnd;
  }, [today, monthsHalf, zoom, maxProjectDate]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);

  // For 1R, compute dayPx to fit screen; otherwise use fixed
  const dayPx = zoom === "1R" && containerWidth > 0
    ? containerWidth / totalDays
    : ZOOM_DAY_PX[zoom];
  const timelineWidth = zoom === "1R" && containerWidth > 0
    ? containerWidth
    : totalDays * dayPx;

  // Month columns
  const months = useMemo(() => {
    const result: { label: string; startX: number; width: number; date: Date }[] = [];
    let d = timelineStart;
    while (d < timelineEnd) {
      const next = addMonths(d, 1);
      const end = next < timelineEnd ? next : timelineEnd;
      const startX = dayOffset(d, timelineStart, dayPx);
      const w = dayOffset(end, timelineStart, dayPx) - startX;
      let label: string;
      if (zoom === "1R") {
        label = CZECH_MONTHS_SHORT[d.getMonth()];
      } else if (zoom === "6M") {
        label = CZECH_MONTHS[d.getMonth()];
      } else {
        label = `${CZECH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      }
      result.push({ label, startX, width: w, date: d });
      d = next;
    }
    return result;
  }, [timelineStart, timelineEnd, dayPx, zoom]);

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

  // Sync scroll — vertical: left ↔ right body; horizontal: right body → header
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
    if (timelineHeaderRef.current && rightRef.current) timelineHeaderRef.current.scrollLeft = rightRef.current.scrollLeft;
    syncing.current = false;
  }, []);

  useEffect(() => {
    if (rightRef.current) {
      const scrollLeft = Math.max(0, todayX - rightRef.current.clientWidth / 2);
      rightRef.current.scrollLeft = scrollLeft;
      if (timelineHeaderRef.current) timelineHeaderRef.current.scrollLeft = scrollLeft;
    }
  }, [todayX, zoom]);

  const toggleExpand = (pid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  // Pre-compute warnings for left panel
  const projectWarnings = useMemo(() => {
    const map: Record<string, MilestoneWarning[]> = {};
    for (const p of sorted) {
      const S = parseDateField(p.datum_objednavky);
      const E = parseDateField(p.datum_smluvni);
      const TPV = parseDateField(p.tpv_date);
      const EXP = parseDateField(p.expedice);
      const PRE = parseDateField(p.predani);
      map[p.project_id] = getBarWarnings(S, E, TPV, EXP, PRE);
    }
    return map;
  }, [sorted]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const HEADER_HEIGHT = showWeeks ? 52 : 32;
  const weekFontClass = zoom === "3M" ? "text-[9px] text-muted-foreground/60" : "text-[8px] text-muted-foreground/40";

  return (
    <>
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>

      {/* PART 1 — FIXED HEADER ROW (never scrolls vertically) */}
      <div className="flex shrink-0 border-b bg-primary/5">
        {/* Left panel header */}
        <div className="border-r shrink-0 flex items-center px-2 gap-2" style={{ width: LEFT_PANEL_WIDTH, height: HEADER_HEIGHT }}>
          <button onClick={() => togglePlanSort("project_id")} className="flex items-center gap-1 h-9 px-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap hover:text-foreground transition-colors" style={{ width: 110, flexShrink: 0 }}>
            {planIdLabel}
            {planSortCol === "project_id" ? (planSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
          </button>
          <button onClick={() => togglePlanSort("project_name")} className="flex items-center gap-1 h-9 px-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap hover:text-foreground transition-colors flex-1">
            {planNameLabel}
            {planSortCol === "project_name" ? (planSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
          </button>
        </div>
        {/* Timeline header — horizontal scroll synced with body */}
        <div
          ref={timelineHeaderRef}
          className="flex-1 overflow-hidden"
          style={{ height: HEADER_HEIGHT }}
        >
          <div style={{ width: timelineWidth, minWidth: timelineWidth, position: "relative" }}>
            {/* Month row */}
            <div className="flex" style={{ height: showWeeks ? 28 : HEADER_HEIGHT }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className={`border-r font-medium text-muted-foreground flex items-center justify-center shrink-0 ${zoom === "1R" ? "text-[10px]" : "text-[11px]"}`}
                  style={{ width: m.width }}
                >
                  {m.label}
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
          </div>
        </div>
      </div>

      {/* PART 2 — SCROLLABLE BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel rows — scrolls vertically only */}
        <div
          ref={leftRef}
          onScroll={handleLeftScroll}
          className="overflow-y-auto overflow-x-hidden border-r shrink-0"
          style={{ width: LEFT_PANEL_WIDTH, scrollbarWidth: "none" }}
        >
          {sorted.map((p) => {
            const isExp = expanded.has(p.project_id);
            const warnings = projectWarnings[p.project_id] || [];
            return (
              <div key={p.id}>
                <div
                  className="flex items-center gap-1 px-3 border-b hover:bg-muted/30 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(p.project_id); }}
                  >
                    <ExpandButton projectId={p.project_id} expanded={isExp} onClick={() => {}} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap shrink-0 cursor-pointer hover:underline" style={{ width: 80 }} onClick={() => setEditProject(p)}>{p.project_id}</span>
                  {warnings.length > 0 && <WarningIcon warnings={warnings} />}
                  <span className="text-xs font-medium truncate flex-1 min-w-0 cursor-pointer hover:underline" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => setEditProject(p)}>{p.project_name}</span>
                </div>
                {isExp && <SubstageLeftRows projectId={p.project_id} project={p} statusColorMap={statusColorMap} />}
              </div>
            );
          })}
        </div>

        {/* Right panel — timeline body, scrolls both ways */}
        <div ref={rightRef} onScroll={handleRightScroll} className={`flex-1 relative ${zoom === "1R" ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"}`}>
          <div style={{ width: timelineWidth, minWidth: timelineWidth, position: "relative" }}>
            {/* Rows */}
            {sorted.map((p) => {
              const barData = getProjectBarData(p, statusColorMap);
              const isExp = expanded.has(p.project_id);
              const midY = ROW_HEIGHT / 2;

              return (
                <div key={p.id}>
                  <div
                    className="border-b hover:bg-muted/10 transition-colors"
                    style={{ position: "relative", overflow: "visible", height: ROW_HEIGHT, width: timelineWidth }}
                  >
                    {/* Grid lines */}
                    {showWeeks && weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-l border-border/20" style={{ left: w.x, zIndex: 1 }} />
                    ))}
                    {!showWeeks && months.map((m, i) => (
                      <div key={`mg-${i}`} className="absolute top-0 bottom-0 border-l border-border/20" style={{ left: m.startX, zIndex: 1 }} />
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

                      const phaseLabel = PHASE_LABELS[seg.color];
                      const hasHatch = !!seg.hatchColors;
                      const segDiv = (
                        <div
                          key={`seg-${i}`}
                          style={{
                            position: "absolute",
                            left: x,
                            top: 16,
                            width: segW,
                            height: BAR_HEIGHT,
                            background: hasHatch ? hatchBackground(seg.hatchColors![0], seg.hatchColors![1]) : seg.color,
                            zIndex: 2,
                            borderRadius: 4,
                            minWidth: 4,
                          }}
                        >
                          {segW > 32 && wkLabel && (
                            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "white", lineHeight: 1 }}>
                              {wkLabel}
                            </span>
                          )}
                        </div>
                      );
                      if (!phaseLabel) return segDiv;
                      return (
                        <TooltipProvider key={`seg-${i}`} delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>{segDiv}</TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">{phaseLabel}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}

                    {/* Milestone diamonds */}
                    {barData.diamonds.map((m, i, arr) => {
                      const showLabel = !arr.some((other, j) => j > i && Math.abs(differenceInDays(other.date, m.date)) <= 5);
                      const canDrag = DRAGGABLE_MILESTONES.has(m.name) && m.fieldKey && !isFieldReadOnly(m.fieldKey);
                      return (
                        <MilestoneDiamond
                          key={i} date={m.date} color={m.color} label={m.label} name={m.name}
                          origin={timelineStart} dayPx={dayPx} midY={midY} showLabel={showLabel}
                          zIndex={10 + m.priority}
                          draggable={canDrag}
                          onDragEnd={canDrag && m.fieldKey ? (newDate) => {
                            const oldVal = (p as any)[m.fieldKey!] ?? "";
                            updateProject.mutate({
                              id: p.id,
                              field: m.fieldKey!,
                              value: formatAppDate(newDate),
                              oldValue: oldVal,
                              projectId: p.project_id,
                            });
                          } : undefined}
                        />
                      );
                    })}
                  </div>

                  {/* Substage rows */}
                  {isExp && (
                    <SubstageRows projectId={p.project_id} project={p} origin={timelineStart} dayPx={dayPx} timelineWidth={timelineWidth} statusColorMap={statusColorMap} />
                  )}
                </div>
              );
            })}

            {/* Today vertical line + inline Dnes label */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{ left: todayX, width: 2, backgroundColor: "#e74c3c" }}
            />
            <span
              className="absolute z-30 pointer-events-none"
              style={{ left: todayX - 36, top: 4, fontSize: 9, fontWeight: 700, color: "#e74c3c", whiteSpace: "nowrap" }}
            >
              Dnes ▶
            </span>
          </div>
        </div>
      </div>
    </div>

      <PlanDateEditDialog
        project={editProject}
        open={!!editProject}
        onOpenChange={(open) => { if (!open) setEditProject(null); }}
      />
    </>
  );
}

// ── Substage left panel rows ────────────────────────────────────────
function SubstageLeftRows({ projectId, project, statusColorMap }: { projectId: string; project: Project; statusColorMap: Record<string, string> }) {
  const { data: stages = [] } = useProjectStages(projectId);
  return (
    <>
      {stages.map((stage) => {
        const barData = getStageBarData(stage, project, statusColorMap);
        return (
          <div key={stage.id} className="flex items-center gap-2 pl-8 pr-3 border-b bg-muted/10" style={{ height: SUBSTAGE_ROW_HEIGHT }}>
            {barData.warnings.length > 0 && <WarningIcon warnings={barData.warnings} />}
            <span className="text-[10px] text-muted-foreground truncate">{stage.stage_name}</span>
          </div>
        );
      })}
    </>
  );
}
