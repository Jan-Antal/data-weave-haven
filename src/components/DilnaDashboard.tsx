/**
 * Dílna — production floor dashboard showing current week's activity.
 * Visual aligned with VykazReport (Card-based summary).
 * Status logic: compares tracked-hours % vs daily-log completion %.
 *   • green  — tracked ≤ completion + 5 % (on track / ahead)
 *   • orange — tracked is 5–20 % ahead of completion (slipping)
 *   • red    — tracked > 20 % ahead of completion (delayed)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, AlertCircle } from "lucide-react";
import { getProjectColor } from "@/lib/projectColors";

/* ── helpers ─────────────────────────────────────────────────────── */

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getISOWeekForOffset(offset: number): { year: number; week: number; monday: Date; friday: Date; weekKey: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff + offset * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const thu = new Date(monday);
  thu.setDate(monday.getDate() + 3);
  const yearStart = new Date(Date.UTC(thu.getFullYear(), 0, 1));
  const thuUtc = Date.UTC(thu.getFullYear(), thu.getMonth(), thu.getDate());
  const week = Math.ceil(((thuUtc - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekKey = toLocalDateStr(monday);
  return { year: thu.getFullYear(), week, monday, friday, weekKey };
}

function fmtHours(n: number) {
  return Math.round(n).toLocaleString("cs-CZ");
}

function fmtTimestamp(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}. v ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ── constants ───────────────────────────────────────────────────── */

const USEK_ORDER: string[] = ["REZ", "DYH", "OLE", "CNC", "VRT", "LAK", "KOM", "BAL"];
function usekSortKey(kod: string): number {
  const idx = USEK_ORDER.indexOf(kod);
  return idx >= 0 ? idx : USEK_ORDER.length;
}

/** Slip tolerance thresholds (in % points). */
const SLIP_OK_TOL = 5;     // tracked − completion ≤ 5 %  → green
const SLIP_RED = 20;       // tracked − completion > 20 % → red

/* ── types ───────────────────────────────────────────────────────── */

interface UsekRow { kod: string; nazov: string; hodiny: number }

type SlipStatus = "ok" | "slip" | "delay" | "none";

interface ProjectCard {
  projectId: string;
  projectName: string;
  isUnmatched: boolean;
  plannedHours: number;        // sum of scheduled_hours for the displayed week
  loggedHours: number;         // sum of production_hours_log for the displayed week
  trackedPct: number;          // logged / planned (0–∞)
  completionPct: number | null; // latest daily-log percent (0–100), null = no log
  slipStatus: SlipStatus;
  valueCzk: number;
  usekBreakdown: UsekRow[];
}

/* ── data hook ───────────────────────────────────────────────────── */

function useDilnaData(weekOffset: number) {
  const weekInfo = useMemo(() => getISOWeekForOffset(weekOffset), [weekOffset]);
  const sundayStr = useMemo(() => {
    const sun = new Date(weekInfo.friday);
    sun.setDate(sun.getDate() + 2);
    return toLocalDateStr(sun);
  }, [weekInfo]);

  return useQuery({
    queryKey: ["dilna-dashboard-v2", weekInfo.weekKey],
    queryFn: async () => {
      const [hoursRes, schedRes, settingsRes, projectsRes, capacityRes, dailyLogsRes] = await Promise.all([
        supabase
          .from("production_hours_log")
          .select("ami_project_id, hodiny, created_at, datum_sync, cinnost_kod, cinnost_nazov")
          .gte("datum_sync", weekInfo.weekKey)
          .lt("datum_sync", sundayStr)
          .not("cinnost_kod", "in", '("TPV","ENG","PRO")'),
        supabase
          .from("production_schedule")
          .select("project_id, scheduled_hours, status, item_name")
          .eq("scheduled_week", weekInfo.weekKey)
          .not("status", "eq", "cancelled"),
        supabase
          .from("production_settings")
          .select("weekly_capacity_hours")
          .limit(1)
          .single(),
        supabase
          .from("projects")
          .select("project_id, project_name, prodejni_cena, cost_production_pct, currency")
          .is("deleted_at", null),
        supabase
          .from("production_capacity")
          .select("capacity_hours")
          .eq("week_year", weekInfo.year)
          .eq("week_number", weekInfo.week)
          .maybeSingle(),
        // Latest daily-log percent per bundle for THIS week
        supabase
          .from("production_daily_logs" as any)
          .select("bundle_id, day_index, percent, logged_at")
          .eq("week_key", weekInfo.weekKey)
          .order("day_index", { ascending: true }),
      ]);

      const weeklyCapacity =
        Number((capacityRes.data as any)?.capacity_hours) ||
        Number(settingsRes.data?.weekly_capacity_hours) ||
        875;

      const hours = (hoursRes.data || []) as Array<{ ami_project_id: string; hodiny: number; created_at: string; datum_sync: string; cinnost_kod: string | null; cinnost_nazov: string | null }>;
      const schedule = (schedRes.data || []) as Array<{ project_id: string; scheduled_hours: number; status: string; item_name: string }>;
      const projects = (projectsRes.data || []) as Array<{ project_id: string; project_name: string; prodejni_cena: number | null; cost_production_pct: number | null; currency: string | null }>;
      const dailyLogs = (dailyLogsRes.data || []) as Array<{ bundle_id: string; day_index: number; percent: number; logged_at: string }>;

      const totalHoursWeek = hours.reduce((s, h) => s + Number(h.hodiny), 0);
      const today = toLocalDateStr(new Date());
      const todayHours = hours.filter(h => h.datum_sync === today).reduce((s, h) => s + Number(h.hodiny), 0);
      const lastSync = hours.length > 0 ? hours.reduce((max, h) => h.created_at > max ? h.created_at : max, hours[0].created_at) : null;

      // Per-project hours + úsek breakdown
      const hoursByProject = new Map<string, number>();
      const usekByProject = new Map<string, Map<string, { kod: string; nazov: string; hodiny: number }>>();
      for (const h of hours) {
        const pid = h.ami_project_id;
        hoursByProject.set(pid, (hoursByProject.get(pid) || 0) + Number(h.hodiny));
        const kod = h.cinnost_kod || "NEZ";
        if (!usekByProject.has(pid)) usekByProject.set(pid, new Map());
        const pMap = usekByProject.get(pid)!;
        const existing = pMap.get(kod);
        if (existing) existing.hodiny += Number(h.hodiny);
        else pMap.set(kod, { kod, nazov: h.cinnost_nazov || (kod === "NEZ" ? "Nezařazeno" : kod), hodiny: Number(h.hodiny) });
      }

      // Scheduled projects (planned hours per project this week)
      const scheduledProjects = new Map<string, number>();
      for (const s of schedule) {
        if (s.status === "historical") continue;
        scheduledProjects.set(s.project_id, (scheduledProjects.get(s.project_id) || 0) + Number(s.scheduled_hours));
      }

      // Latest daily-log percent per project — bundle_id = `${projectId}::${weekKey}`
      const latestPctByProject = new Map<string, number>();
      for (const log of dailyLogs) {
        const pid = log.bundle_id.split("::")[0];
        if (!pid) continue;
        const cur = latestPctByProject.get(pid);
        // Take max day_index (most recent). Logs already ordered ascending → simple overwrite works.
        if (cur == null || log.percent != null) latestPctByProject.set(pid, Number(log.percent));
      }

      const projMap = new Map(projects.map(p => [p.project_id, p]));
      const knownProjectIds = new Set(projMap.keys());

      const cards: ProjectCard[] = [];

      // 1) Scheduled (planned) projects — primary cards
      for (const [pid, plannedHours] of scheduledProjects) {
        const proj = projMap.get(pid);
        const isUnmatched = !proj;
        const loggedHours = hoursByProject.get(pid) || 0;
        const trackedPct = plannedHours > 0 ? Math.round((loggedHours / plannedHours) * 100) : 0;
        const completionPct = latestPctByProject.has(pid) ? latestPctByProject.get(pid)! : null;
        const slipStatus = computeSlip(trackedPct, completionPct, loggedHours);

        const prodPct = (proj?.cost_production_pct ?? 30) / 100;
        const cena = proj?.prodejni_cena ?? 0;
        const valueCzk = cena * prodPct;

        const usekMap = usekByProject.get(pid);
        const usekBreakdown = usekMap
          ? Array.from(usekMap.values()).sort((a, b) => usekSortKey(a.kod) - usekSortKey(b.kod))
          : [];

        cards.push({
          projectId: pid,
          projectName: isUnmatched ? "Nespárované" : (proj?.project_name || pid),
          isUnmatched,
          plannedHours,
          loggedHours,
          trackedPct,
          completionPct,
          slipStatus,
          valueCzk,
          usekBreakdown,
        });
      }

      // 2) Unmatched: hours logged this week to a project_id that has NO schedule and NO project record
      for (const [pid, loggedHours] of hoursByProject) {
        if (scheduledProjects.has(pid)) continue;
        if (knownProjectIds.has(pid)) continue;          // matched but unscheduled — skip (not a production-floor concern)
        if (loggedHours < 0.05) continue;
        const usekMap = usekByProject.get(pid);
        const usekBreakdown = usekMap
          ? Array.from(usekMap.values()).sort((a, b) => usekSortKey(a.kod) - usekSortKey(b.kod))
          : [];
        cards.push({
          projectId: pid,
          projectName: "Nespárované",
          isUnmatched: true,
          plannedHours: 0,
          loggedHours,
          trackedPct: 0,
          completionPct: null,
          slipStatus: "none",
          valueCzk: 0,
          usekBreakdown,
        });
      }

      // Sort: delays first, then slips, then ok, then unmatched/no-data last
      const slipRank: Record<SlipStatus, number> = { delay: 0, slip: 1, ok: 2, none: 3 };
      cards.sort((a, b) => {
        const r = slipRank[a.slipStatus] - slipRank[b.slipStatus];
        if (r !== 0) return r;
        return b.loggedHours - a.loggedHours;
      });

      const unmatchedCount = cards.filter(c => c.isUnmatched).length;
      const delayCount = cards.filter(c => c.slipStatus === "delay").length;
      const slipCount = cards.filter(c => c.slipStatus === "slip").length;

      return {
        weekInfo,
        weeklyCapacity,
        totalHoursWeek,
        todayHours,
        dailyTarget: weeklyCapacity / 5,
        lastSync,
        cards,
        unmatchedCount,
        delayCount,
        slipCount,
      };
    },
    staleTime: 60_000,
  });
}

/** Compute slip status from tracked-% vs completion-%. */
function computeSlip(trackedPct: number, completionPct: number | null, loggedHours: number): SlipStatus {
  if (loggedHours <= 0) return "none";
  if (completionPct == null) return "none";
  const diff = trackedPct - completionPct;     // > 0 = burning hours faster than completing work
  if (diff > SLIP_RED) return "delay";
  if (diff > SLIP_OK_TOL) return "slip";
  return "ok";
}

/* ── color helpers (gradient palette aligned with PlanVyrobyTableView) ── */

function slipBarStyles(status: SlipStatus): { bar: string; bg: string } {
  switch (status) {
    case "delay":
      return {
        bar: "#dc3545",
        bg: "linear-gradient(90deg, #fca5a5, #dc3545)",
      };
    case "slip":
      return {
        bar: "#d97706",
        bg: "linear-gradient(90deg, #fcd34d, #d97706)",
      };
    case "ok":
      return {
        bar: "#3a8a36",
        bg: "linear-gradient(90deg, #a7d9a2, #3a8a36)",
      };
    default:
      return {
        bar: "#b0bab8",
        bg: "linear-gradient(90deg, #e2e8f0, #cbd5e1)",
      };
  }
}

function slipPillClass(status: SlipStatus): string {
  switch (status) {
    case "delay": return "bg-[#dc3545]/15 text-[#b1232f]";
    case "slip":  return "bg-[#d97706]/15 text-[#b65d05]";
    case "ok":    return "bg-[#3a8a36]/15 text-[#2f6f2c]";
    default:      return "bg-muted text-muted-foreground";
  }
}

function slipLabel(status: SlipStatus): string {
  switch (status) {
    case "delay": return "V omeškání";
    case "slip":  return "Ve skluzu";
    case "ok":    return "V plánu";
    default:      return "Bez logu";
  }
}

/* ── component ───────────────────────────────────────────────────── */

export function DilnaDashboard({ weekOffset }: { weekOffset: number }) {
  const { data, isLoading } = useDilnaData(weekOffset);
  const [allExpanded, setAllExpanded] = useState(false);
  const toggleAllExpand = () => setAllExpanded(prev => !prev);

  if (isLoading || !data) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="flex-1 p-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { weeklyCapacity, totalHoursWeek, todayHours, dailyTarget, lastSync, cards, unmatchedCount, delayCount, slipCount } = data;
  const weekPct = weeklyCapacity > 0 ? Math.min(100, Math.round((totalHoursWeek / weeklyCapacity) * 100)) : 0;
  const todayPct = dailyTarget > 0 ? Math.min(100, Math.round((todayHours / dailyTarget) * 100)) : 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Summary cards (matches VykazReport) */}
        <div className="px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Odpracováno tento týden</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{fmtHours(totalHoursWeek)}<span className="text-base font-medium text-muted-foreground"> / {fmtHours(weeklyCapacity)} h</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${weekPct}%` }} />
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dnes / Denní cíl</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{fmtHours(todayHours)}<span className="text-base font-medium text-muted-foreground"> / {fmtHours(dailyTarget)} h</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${todayPct}%`, background: todayPct >= 100 ? "#3a8a36" : todayPct >= 70 ? "#d97706" : "#dc3545" }}
              />
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ve skluzu / V omeškání</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              <span className="text-[#b65d05]">{slipCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-[#b1232f]">{delayCount}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">Z {cards.filter(c => !c.isUnmatched).length} naplánovaných projektů</div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Nespárované</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{unmatchedCount}</div>
            <div className="text-[11px] text-muted-foreground mt-2">
              Aktualizováno {fmtTimestamp(lastSync)}
            </div>
          </Card>
        </div>

        {/* Project cards section */}
        <div className="px-4 pt-2 pb-4">
          {cards.length === 0 ? (
            <Card className="p-8 shadow-sm flex items-center justify-center text-sm text-muted-foreground">
              Žádné naplánované projekty tento týden
            </Card>
          ) : (
            <Card className="p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Projekty týdne</h3>
                <button
                  onClick={toggleAllExpand}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                >
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", allExpanded && "rotate-180")} />
                  {allExpanded ? "Sbalit vše" : "Rozbalit vše"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {cards.map((card) => {
                  const maxUsekHours = card.usekBreakdown.reduce((max, u) => Math.max(max, u.hodiny), 1);
                  const projectColor = getProjectColor(card.projectId);
                  const styles = slipBarStyles(card.slipStatus);
                  const barWidthPct = card.plannedHours > 0
                    ? Math.min(100, Math.round((card.loggedHours / card.plannedHours) * 100))
                    : (card.loggedHours > 0 ? 100 : 0);

                  return (
                    <div
                      key={card.projectId}
                      className="bg-background rounded-lg border border-border/60 p-3 flex flex-col gap-2"
                      style={{ borderLeftWidth: 3, borderLeftColor: card.isUnmatched ? "#94a3b8" : projectColor }}
                    >
                      {/* Top: name + slip badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {card.isUnmatched ? (
                            <>
                              <p className="text-[11px] font-mono text-foreground truncate">{card.projectId}</p>
                              <p className="text-[12px] text-muted-foreground italic flex items-center gap-1 mt-0.5">
                                <AlertCircle className="w-3 h-3" /> Nespárované
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[14px] font-medium leading-tight truncate" title={card.projectName}>{card.projectName}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{card.projectId}</p>
                            </>
                          )}
                        </div>
                        <span className={cn(
                          "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
                          slipPillClass(card.slipStatus)
                        )}>
                          {slipLabel(card.slipStatus)}
                        </span>
                      </div>

                      {/* Progress bar — gradient palette (Plan Výroby style) */}
                      <div className="space-y-1">
                        <div
                          className="h-2.5 rounded-full overflow-hidden bg-muted"
                          title={
                            card.completionPct != null
                              ? `Hodiny ${card.trackedPct}% · Dokončeno ${card.completionPct}%`
                              : `Hodiny ${card.trackedPct}%`
                          }
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${barWidthPct}%`, background: styles.bg }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                          <span>
                            Hodiny <span className="font-medium text-foreground">{card.trackedPct}%</span>
                          </span>
                          {card.completionPct != null ? (
                            <span>
                              Dokončeno <span className="font-medium text-foreground">{card.completionPct}%</span>
                            </span>
                          ) : (
                            <span className="italic">Bez denního logu</span>
                          )}
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground tabular-nums">{fmtHours(card.loggedHours)}h</span>
                          {card.plannedHours > 0 && <> / {fmtHours(card.plannedHours)}h</>}
                        </span>
                        {card.valueCzk > 0 && (
                          <span>
                            <span className="font-medium text-foreground tabular-nums">
                              {(card.valueCzk / 1_000_000).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M Kč
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Úsek breakdown */}
                      {allExpanded && card.usekBreakdown.length > 0 && (
                        <div className="mt-1 pt-1.5 border-t border-border/40 flex flex-col gap-1 animate-accordion-down">
                          {card.usekBreakdown.map((u) => (
                            <div key={u.kod} className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground w-24 shrink-0 truncate" title={`${u.kod} · ${u.nazov}`}>
                                {u.kod} · {u.nazov}
                              </span>
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.round((u.hodiny / maxUsekHours) * 100)}%`,
                                    backgroundColor: card.isUnmatched ? "#94a3b8" : projectColor,
                                  }}
                                />
                              </div>
                              <span className="text-[11px] font-medium tabular-nums text-foreground w-10 text-right shrink-0">
                                {Math.round(u.hodiny * 10) / 10}h
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 pb-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(90deg, #a7d9a2, #3a8a36)" }} />
            V plánu (do +5 %)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(90deg, #fcd34d, #d97706)" }} />
            Ve skluzu (+5 % až +20 %)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(90deg, #fca5a5, #dc3545)" }} />
            V omeškání (nad +20 %)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-muted border border-border" />
            Bez denního logu
          </span>
        </div>
      </div>
    </div>
  );
}
