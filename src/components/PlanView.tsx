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

  // S + E exist
  const hasTPV = !!TPV;
  const hasEXP = !!EXP;

  if (!hasTPV && !hasEXP) {
    warnings.push({ message: "Chybí milníky TPV a Expedice" });
  } else if (!hasTPV) {
    warnings.push({ message: "Chybí milník TPV" });
  } else if (!hasEXP) {
    warnings.push({ message: "Chybí milník Expedice" });
  }
  return warnings;
}

// ── Bar data computation ────────────────────────────────────────────
interface Segment {
  start: Date;
  end: Date;
  color: string;
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
  warnings: MilestoneWarning[];
}

function makeDiamonds(items: { date: Date; color: string; name: string }[]): Diamond[] {
  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted.map((m, i, arr) => {
    let yOffset = 0;
    if (i > 0 && Math.abs(differenceInDays(m.date, arr[i - 1].date)) <= OVERLAP_THRESHOLD_DAYS) {
      const offsets = [0, -10, 10];
      yOffset = offsets[i % 3] || 0;
    }
    return { date: m.date, color: m.color, label: formatMilestoneLabel(m.date), name: m.name, yOffset };
  });
}

function getProjectBarData(p: Project, _statusColorMap: Record<string, string>): BarData {
  const S = parseDateField(p.datum_objednavky);
  const E = parseDateField(p.datum_smluvni);
  const TPV = parseDateField(p.tpv_date);
  const EXP = parseDateField(p.expedice);
  const PRE = parseDateField(p.predani);

  const warnings = getBarWarnings(S, E, TPV, EXP, PRE);
  const hasWarning = warnings.length > 0;

  const empty: BarData = { segments: [], diamonds: [], hasWarning, warnings };

  // No end date at all → nothing to render
  if (!E) return empty;

  // Helper to build diamonds list
  const dItems: { date: Date; color: string; name: string }[] = [];

  // CASE 1 — Only E exists (no S)
  if (!S) {
    dItems.push({ date: E, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { ...empty, diamonds: makeDiamonds(dItems) };
  }

  // From here S + E both exist
  const safeE = differenceInDays(E, S) < 7 ? addDays(S, 7) : E;

  // CASE 2 — S + E only (no milestones)
  if (!TPV && !EXP && !PRE) {
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [{ start: S, end: safeE, color: PHASE_COLORS.dokonceno }],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // CASE 7 — S + E + PRE only (no TPV, no EXP)
  if (!TPV && !EXP && PRE) {
    dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [{ start: S, end: safeE, color: PHASE_COLORS.dokonceno }],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // CASE 6 — S + E + EXP only (no TPV)
  if (!TPV && EXP && !PRE) {
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [
        { start: S, end: EXP, color: PHASE_COLORS.vyroba },
        { start: EXP, end: safeE, color: PHASE_COLORS.montaz },
      ],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // CASE 3 — S + E + TPV only
  if (TPV && !EXP && !PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [
        { start: S, end: TPV, color: PHASE_COLORS.konstrukce },
        { start: TPV, end: safeE, color: PHASE_COLORS.dokonceno },
      ],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // CASE 4 — S + E + TPV + EXP (no PRE)
  if (TPV && EXP && !PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [
        { start: S, end: TPV, color: PHASE_COLORS.konstrukce },
        { start: TPV, end: EXP, color: PHASE_COLORS.vyroba },
        { start: EXP, end: safeE, color: PHASE_COLORS.montaz },
      ],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // CASE 5 — S + E + TPV + EXP + PRE (all present)
  if (TPV && EXP && PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return {
      segments: [
        { start: S, end: TPV, color: PHASE_COLORS.konstrukce },
        { start: TPV, end: EXP, color: PHASE_COLORS.vyroba },
        { start: EXP, end: PRE, color: PHASE_COLORS.montaz },
        { start: PRE, end: safeE, color: PHASE_COLORS.dokonceno },
      ],
      diamonds: makeDiamonds(dItems),
      hasWarning, warnings,
    };
  }

  // Remaining edge cases (e.g. TPV + PRE no EXP, or EXP + PRE no TPV)
  // Build segments generically
  const segs: Segment[] = [];
  const pts: Date[] = [S];
  if (TPV) { dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" }); pts.push(TPV); }
  if (EXP) { dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" }); pts.push(EXP); }
  if (PRE) { dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" }); pts.push(PRE); }
  pts.push(safeE);
  pts.sort((a, b) => a.getTime() - b.getTime());

  const colorSeq = [PHASE_COLORS.konstrukce, PHASE_COLORS.vyroba, PHASE_COLORS.montaz, PHASE_COLORS.dokonceno];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].getTime() === pts[i + 1].getTime()) continue;
    segs.push({ start: pts[i], end: pts[i + 1], color: colorSeq[Math.min(i, 3)] });
  }

  const allDiamonds = makeDiamonds(dItems);
  const connectorLine = allDiamonds.length >= 2
    ? { startX: allDiamonds[0].date, endX: allDiamonds[allDiamonds.length - 1].date }
    : undefined;

  return { segments: segs, diamonds: allDiamonds, connectorLine, hasWarning, warnings };
}

function getStageBarData(stage: ProjectStage, project: Project, _statusColorMap: Record<string, string>): BarData {
  // S = stage's own start_date, fallback to parent's datum_objednavky
  const S = parseDateField(stage.start_date) ?? parseDateField(project.datum_objednavky);
  // E = stage's datum_smluvni, fallback to end_date, then parent's datum_smluvni
  const E = parseDateField(stage.datum_smluvni) ?? parseDateField(stage.end_date) ?? parseDateField(project.datum_smluvni);
  const TPV = parseDateField(stage.tpv_date);
  const EXP = parseDateField(stage.expedice);
  const PRE = parseDateField(stage.predani);

  const warnings = getBarWarnings(S, E, TPV, EXP, PRE);
  const hasWarning = warnings.length > 0;
  const empty: BarData = { segments: [], diamonds: [], hasWarning, warnings };

  if (!E) return empty;

  const dItems: { date: Date; color: string; name: string }[] = [];

  // CASE 1 — Only E (no S)
  if (!S) {
    dItems.push({ date: E, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { ...empty, diamonds: makeDiamonds(dItems) };
  }

  const safeE = differenceInDays(E, S) < 7 ? addDays(S, 7) : E;

  // CASE 2 — S + E only
  if (!TPV && !EXP && !PRE) {
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: safeE, color: PHASE_COLORS.dokonceno }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // CASE 7 — S + E + PRE only
  if (!TPV && !EXP && PRE) {
    dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: safeE, color: PHASE_COLORS.dokonceno }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // CASE 6 — S + E + EXP only
  if (!TPV && EXP && !PRE) {
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: EXP, color: PHASE_COLORS.vyroba }, { start: EXP, end: safeE, color: PHASE_COLORS.montaz }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // CASE 3 — S + E + TPV only
  if (TPV && !EXP && !PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: TPV, color: PHASE_COLORS.konstrukce }, { start: TPV, end: safeE, color: PHASE_COLORS.dokonceno }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // CASE 4 — S + E + TPV + EXP (no PRE)
  if (TPV && EXP && !PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: safeE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: TPV, color: PHASE_COLORS.konstrukce }, { start: TPV, end: EXP, color: PHASE_COLORS.vyroba }, { start: EXP, end: safeE, color: PHASE_COLORS.montaz }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // CASE 5 — S + E + TPV + EXP + PRE
  if (TPV && EXP && PRE) {
    dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" });
    dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" });
    dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" });
    return { segments: [{ start: S, end: TPV, color: PHASE_COLORS.konstrukce }, { start: TPV, end: EXP, color: PHASE_COLORS.vyroba }, { start: EXP, end: PRE, color: PHASE_COLORS.montaz }, { start: PRE, end: safeE, color: PHASE_COLORS.dokonceno }], diamonds: makeDiamonds(dItems), hasWarning, warnings };
  }

  // Fallback
  const segs: Segment[] = [];
  const pts: Date[] = [S];
  if (TPV) { dItems.push({ date: TPV, color: MILESTONE_COLORS.tpv_date, name: "TPV" }); pts.push(TPV); }
  if (EXP) { dItems.push({ date: EXP, color: MILESTONE_COLORS.expedice, name: "Expedice" }); pts.push(EXP); }
  if (PRE) { dItems.push({ date: PRE, color: MILESTONE_COLORS.predani, name: "Předání" }); pts.push(PRE); }
  pts.push(safeE);
  pts.sort((a, b) => a.getTime() - b.getTime());
  const colorSeq = [PHASE_COLORS.konstrukce, PHASE_COLORS.vyroba, PHASE_COLORS.montaz, PHASE_COLORS.dokonceno];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].getTime() === pts[i + 1].getTime()) continue;
    segs.push({ start: pts[i], end: pts[i + 1], color: colorSeq[Math.min(i, 3)] });
  }
  return { segments: segs, diamonds: makeDiamonds(dItems), hasWarning, warnings };
}

// ── Milestone Diamond ───────────────────────────────────────────────
function MilestoneDiamond({
  date, color, label, name, origin, dayPx, midY, yOffset, small, labelRow,
}: {
  date: Date; color: string; label: string; name: string;
  origin: Date; dayPx: number; midY: number; yOffset: number; small?: boolean;
  labelRow?: number;
}) {
  const x = dayOffset(date, origin, dayPx);
  const size = small ? 7 : DIAMOND_SIZE;
  // Label above bar: row 0 → top 0, row 1 → top 10
  const labelTop = (labelRow ?? 0) === 1 ? 10 : 0;

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
          left: x,
          top: labelTop,
          transform: "translateX(-50%)",
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
  const barTop = midY - SUBSTAGE_BAR_HEIGHT / 2;

  return (
    <div style={{ height: SUBSTAGE_ROW_HEIGHT, position: "relative", overflow: "visible", width: timelineWidth }}>
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
        const segW = Math.max(w, 4);
        const wkLabel = weeksLabel(seg.start, seg.end);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x, top: barTop,
              width: segW, height: SUBSTAGE_BAR_HEIGHT,
              background: seg.color,
              zIndex: 2, borderRadius: 4, minWidth: 4,
            }}
          >
            {segW > 32 && wkLabel && (
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, color: "white", lineHeight: 1 }}>{wkLabel}</span>
            )}
          </div>
        );
      })}
      {barData.diamonds.map((m, i, arr) => {
        let labelRow = 0;
        if (i > 0 && Math.abs(differenceInDays(m.date, arr[i - 1].date)) <= 4) {
          labelRow = i % 2;
        }
        return (
          <MilestoneDiamond key={i} date={m.date} color={m.color} label={m.label} name={m.name} origin={origin} dayPx={dayPx} midY={midY} yOffset={m.yOffset} small labelRow={labelRow} />
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
  const { sorted } = useSortFilter(projects, { personFilter, statusFilter }, search);
  const zoom = zoomProp ?? ("3M" as ZoomLevel);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState(0);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
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

  // For 3M: extend end to cover all project dates
  const maxProjectDate = useMemo(() => {
    if (zoom !== "3M") return null;
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
    if (zoom === "3M" && maxProjectDate && maxProjectDate > defaultEnd) {
      // Extend to one month past the furthest date
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
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap shrink-0" style={{ width: 80 }}>{p.project_id}</span>
                  {warnings.length > 0 && <WarningIcon warnings={warnings} />}
                  <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.project_name}</span>
                </div>
                {isExp && <SubstageLeftRows projectId={p.project_id} />}
              </div>
            );
          })}
        </div>

        {/* RIGHT PANEL — TIMELINE */}
        <div ref={rightRef} onScroll={handleRightScroll} className={`flex-1 relative ${zoom === "1R" ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"}`}>
          <div style={{ width: timelineWidth, minWidth: timelineWidth, position: "relative" }}>
            {/* Timeline header */}
            <div className="sticky top-0 z-20 bg-card border-b" style={{ height: HEADER_HEIGHT, position: "relative" }}>
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
              {/* Dnes label removed from header — now inline in chart area */}
            </div>

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

                      return (
                        <div
                          key={`seg-${i}`}
                          style={{
                            position: "absolute",
                            left: x,
                            top: 16,
                            width: segW,
                            height: BAR_HEIGHT,
                            background: seg.color,
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
                    })}

                    {/* Milestone diamonds */}
                    {barData.diamonds.map((m, i, arr) => {
                      // Alternate label rows when diamonds are close
                      let labelRow = 0;
                      if (i > 0 && Math.abs(differenceInDays(m.date, arr[i - 1].date)) <= 4) {
                        labelRow = i % 2;
                      }
                      return (
                        <MilestoneDiamond key={i} date={m.date} color={m.color} label={m.label} name={m.name} origin={timelineStart} dayPx={dayPx} midY={midY} yOffset={m.yOffset} labelRow={labelRow} />
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
  );
}

// ── Substage left panel rows ────────────────────────────────────────
function SubstageLeftRows({ projectId }: { projectId: string }) {
  const { data: stages = [] } = useProjectStages(projectId);
  // Compute warnings per stage using same logic as parent project
  // Stages don't have datum_objednavky, use start_date as S
  return (
    <>
      {stages.map((stage) => {
        const S = parseDateField(stage.start_date);
        const E = parseDateField(stage.datum_smluvni) ?? parseDateField(stage.end_date);
        const TPV = parseDateField(stage.tpv_date);
        const EXP = parseDateField(stage.expedice);
        const PRE = parseDateField(stage.predani);
        const warnings = getBarWarnings(S, E, TPV, EXP, PRE);
        return (
          <div key={stage.id} className="flex items-center gap-1 pl-8 pr-3 border-b bg-muted/10" style={{ height: SUBSTAGE_ROW_HEIGHT }}>
            {warnings.length > 0 && <WarningIcon warnings={warnings} />}
            <span className="text-[10px] text-muted-foreground truncate">{stage.stage_name}</span>
          </div>
        );
      })}
    </>
  );
}
