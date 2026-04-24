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

/** Slip tolerance thresholds (in % points) — aligned with Vyroba module. */
const SLIP_OK_TOL = 0;     // completion ≥ expected → green (on plan or ahead)
const SLIP_RED = 5;        // completion ≥ expected − 5 → orange (≤5 % below); else red (>5 % below)

function fmtMCzk(n: number): string {
  if (!n || n <= 0) return "—";
  return `${(n / 1_000_000).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M Kč`;
}

/* ── types ───────────────────────────────────────────────────────── */

interface UsekRow { kod: string; nazov: string; hodiny: number }

type SlipStatus = "ok" | "slip" | "delay" | "none";
type CardWarning = "none" | "off_plan" | "unmatched";

interface BundleRow {
  bundleId: string;            // schedule row id (first row of the bundle)
  displayLabel: string;        // e.g. "A", "A 2/4"
  scheduledHours: number;
  expectedPct: number | null;
  completionPct: number | null;
  slipStatus: SlipStatus;
}

interface ProjectCard {
  projectId: string;
  projectName: string;
  warning: CardWarning;
  plannedHours: number;        // sum of scheduled_hours for the displayed week
  loggedHours: number;         // sum of production_hours_log for the displayed week
  trackedPct: number;          // logged / planned (0–∞)
  completionPct: number | null; // latest daily-log percent (0–100), null = no log
  expectedPct: number | null;   // expected progress today (chain-window aware)
  slipStatus: SlipStatus;       // worst across bundles
  valueCzk: number;             // realne (logged) value
  valueTargetCzk: number;       // cíl (planned) value
  bundles: BundleRow[];
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
      const [hoursRes, schedRes, settingsRes, projectsRes, capacityRes, dailyLogsRes, overheadRes, allSchedRes, planHoursRes, exchangeRes, realHoursRes] = await Promise.all([
        supabase
          .from("production_hours_log")
          .select("ami_project_id, hodiny, created_at, datum_sync, cinnost_kod, cinnost_nazov")
          .gte("datum_sync", weekInfo.weekKey)
          .lt("datum_sync", sundayStr)
          .not("cinnost_kod", "in", '("TPV","ENG","PRO")'),
        // Per-bundle schedule rows for THIS week (for bundle table + planned hours)
        supabase
          .from("production_schedule")
          .select("id, project_id, stage_id, scheduled_hours, status, item_name, bundle_label, bundle_type, split_group_id, split_part, split_total, position")
          .eq("scheduled_week", weekInfo.weekKey)
          .not("status", "eq", "cancelled"),
        supabase
          .from("production_settings")
          .select("weekly_capacity_hours")
          .limit(1)
          .single(),
        supabase
          .from("projects")
          .select("project_id, project_name, prodejni_cena, cost_production_pct, currency, created_at")
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
        // Overhead project codes — to exclude režije/ENG/PM/etc. from production hours
        supabase
          .from("overhead_projects" as any)
          .select("project_code")
          .eq("is_active", true),
        // All schedule rows (across weeks) for chain-window calculation (incl. split_group_id for per-bundle chain)
        supabase
          .from("production_schedule")
          .select("project_id, scheduled_week, scheduled_hours, status, split_group_id, bundle_label")
          .not("status", "eq", "cancelled"),
        // Plan hours per project (for value calculation denominator)
        supabase
          .from("project_plan_hours")
          .select("project_id, hodiny_plan"),
        // Exchange rates for EUR → CZK conversion
        supabase
          .from("exchange_rates")
          .select("year, eur_czk"),
        // Real lifetime hours per project (RPC, mirrors WeeklySilos logic)
        (supabase.rpc as any)("get_hours_by_project"),
      ]);

      const weeklyCapacity =
        Number((capacityRes.data as any)?.capacity_hours) ||
        Number(settingsRes.data?.weekly_capacity_hours) ||
        875;

      const overheadSet = new Set<string>(
        (((overheadRes.data || []) as unknown) as Array<{ project_code: string }>).map(o => o.project_code)
      );

      const hoursRaw = (hoursRes.data || []) as Array<{ ami_project_id: string; hodiny: number; created_at: string; datum_sync: string; cinnost_kod: string | null; cinnost_nazov: string | null }>;
      const hours = hoursRaw.filter(h => !overheadSet.has(h.ami_project_id));
      const schedule = (schedRes.data || []) as Array<{
        id: string;
        project_id: string;
        stage_id: string | null;
        scheduled_hours: number;
        status: string;
        item_name: string;
        bundle_label: string | null;
        bundle_type: string | null;
        split_group_id: string | null;
        split_part: number | null;
        split_total: number | null;
        position: number;
      }>;
      const projects = (projectsRes.data || []) as Array<{ project_id: string; project_name: string; prodejni_cena: number | null; cost_production_pct: number | null; currency: string | null; created_at: string | null }>;
      const dailyLogs = ((dailyLogsRes.data || []) as unknown) as Array<{ bundle_id: string; day_index: number; percent: number; logged_at: string }>;
      const planHoursRows = (planHoursRes.data || []) as Array<{ project_id: string; hodiny_plan: number }>;
      const exchangeRates = (exchangeRes.data || []) as Array<{ year: number; eur_czk: number }>;
      const realHoursRows = (realHoursRes.data || []) as Array<{ ami_project_id: string; total_hodiny: number }>;

      const planHoursMap = new Map<string, number>();
      for (const r of planHoursRows) planHoursMap.set(r.project_id, Number(r.hodiny_plan) || 0);
      const realHoursLifetimeMap = new Map<string, number>();
      for (const r of realHoursRows) realHoursLifetimeMap.set(r.ami_project_id, Number(r.total_hodiny) || 0);

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

      // Track per-project: are all (non-historical, non-cancelled) schedule rows for this week completed?
      // Used to credit planned-hours value when project is closed but logged < planned.
      const projectAllDoneThisWeek = new Map<string, boolean>();
      for (const s of schedule) {
        if (s.status === "historical" || s.status === "cancelled") continue;
        const pid = s.project_id;
        const prev = projectAllDoneThisWeek.has(pid) ? projectAllDoneThisWeek.get(pid)! : true;
        projectAllDoneThisWeek.set(pid, prev && s.status === "completed");
      }

      // Group schedule rows into bundles per project (key by stage_id + bundle_label + split_part)
      const bundlesByProject = new Map<string, Map<string, {
        bundleId: string;
        bundle_label: string | null;
        bundle_type: string | null;
        split_group_id: string | null;
        split_part: number | null;
        split_total: number | null;
        scheduled_hours: number;
        position: number;
      }>>();
      for (const s of schedule) {
        if (s.status === "historical") continue;
        const key = `${s.stage_id ?? "none"}::${s.bundle_label ?? "A"}::${s.split_part ?? "full"}`;
        if (!bundlesByProject.has(s.project_id)) bundlesByProject.set(s.project_id, new Map());
        const bMap = bundlesByProject.get(s.project_id)!;
        const existing = bMap.get(key);
        if (existing) {
          existing.scheduled_hours += Number(s.scheduled_hours);
        } else {
          bMap.set(key, {
            bundleId: s.id,
            bundle_label: s.bundle_label,
            bundle_type: s.bundle_type,
            split_group_id: s.split_group_id,
            split_part: s.split_part,
            split_total: s.split_total,
            scheduled_hours: Number(s.scheduled_hours),
            position: s.position,
          });
        }
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

      // ── Chain windows for split projects (chain-window-aware expected progress) ──
      const allSched = ((allSchedRes.data || []) as Array<{ project_id: string; scheduled_week: string; scheduled_hours: number; status: string; split_group_id: string | null; bundle_label: string | null }>);
      const chainByProject = new Map<string, Array<{ week: string; hours: number }>>();
      for (const row of allSched) {
        if (row.status === "historical" || row.status === "cancelled") continue;
        const pid = row.project_id;
        if (!chainByProject.has(pid)) chainByProject.set(pid, []);
        const arr = chainByProject.get(pid)!;
        const existing = arr.find(w => w.week === row.scheduled_week);
        if (existing) existing.hours += Number(row.scheduled_hours);
        else arr.push({ week: row.scheduled_week, hours: Number(row.scheduled_hours) });
      }
      const chainWindowByProject = new Map<string, { start: number; end: number }>();
      for (const [pid, weeks] of chainByProject) {
        weeks.sort((a, b) => a.week.localeCompare(b.week));
        const total = weeks.reduce((s, w) => s + w.hours, 0);
        if (total <= 0) {
          chainWindowByProject.set(pid, { start: 0, end: 100 });
          continue;
        }
        let cum = 0;
        let start = 0;
        let end = 100;
        let found = false;
        for (const w of weeks) {
          const share = (w.hours / total) * 100;
          if (w.week === weekInfo.weekKey) {
            start = cum;
            end = cum + share;
            found = true;
            break;
          }
          cum += share;
        }
        if (!found) {
          start = 0;
          end = 100;
        }
        chainWindowByProject.set(pid, { start: Math.round(start), end: Math.round(end) });
      }

      // ── Per-bundle chain windows (group by split_group_id; full bundles use project chain) ──
      // For split bundles: chain across weeks of the same split_group_id, displayed week's window is its slice.
      const chainWindowBySplitGroup = new Map<string, { start: number; end: number }>();
      const splitGroupWeeks = new Map<string, Array<{ week: string; hours: number }>>();
      for (const row of allSched) {
        if (row.status === "historical" || row.status === "cancelled") continue;
        if (!row.split_group_id) continue;
        const sg = row.split_group_id;
        if (!splitGroupWeeks.has(sg)) splitGroupWeeks.set(sg, []);
        const arr = splitGroupWeeks.get(sg)!;
        const existing = arr.find(w => w.week === row.scheduled_week);
        if (existing) existing.hours += Number(row.scheduled_hours);
        else arr.push({ week: row.scheduled_week, hours: Number(row.scheduled_hours) });
      }
      for (const [sg, weeks] of splitGroupWeeks) {
        weeks.sort((a, b) => a.week.localeCompare(b.week));
        const total = weeks.reduce((s, w) => s + w.hours, 0);
        if (total <= 0) { chainWindowBySplitGroup.set(sg, { start: 0, end: 100 }); continue; }
        let cum = 0, start = 0, end = 100, found = false;
        for (const w of weeks) {
          const share = (w.hours / total) * 100;
          if (w.week === weekInfo.weekKey) { start = cum; end = cum + share; found = true; break; }
          cum += share;
        }
        if (!found) { start = 0; end = 100; }
        chainWindowBySplitGroup.set(sg, { start: Math.round(start), end: Math.round(end) });
      }

      // ── Spilled projects: have prior weeks with active status (in_progress/paused) ──
      const spilledProjects = new Set<string>();
      for (const row of allSched) {
        if (row.status === "historical" || row.status === "cancelled" || row.status === "completed") continue;
        if (row.scheduled_week < weekInfo.weekKey && (row.status === "in_progress" || row.status === "paused")) {
          spilledProjects.add(row.project_id);
        }
      }

      // ── dayFraction: how far into the displayed week we are ──
      const todayDate = new Date();
      const isCurrentWeek = weekOffset === 0;
      const isPastWeek = weekOffset < 0;
      const dayOfWeek = todayDate.getDay(); // 0=Ne … 6=So
      const workdayIdx = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5); // Po=1 … Pá=5
      const dayFraction = isPastWeek ? 1 : isCurrentWeek ? workdayIdx / 5 : 0;

      function expectedFor(pid: string, plannedHours: number): number | null {
        if (plannedHours <= 0) return null;
        const cw = chainWindowByProject.get(pid) ?? { start: 0, end: 100 };
        return Math.round(cw.start + (cw.end - cw.start) * dayFraction);
      }

      function expectedForBundle(splitGroupId: string | null, projectId: string): number | null {
        const cw = (splitGroupId && chainWindowBySplitGroup.get(splitGroupId))
          || chainWindowByProject.get(projectId)
          || { start: 0, end: 100 };
        return Math.round(cw.start + (cw.end - cw.start) * dayFraction);
      }

      // ── Calculate prodej value (mirrors WeeklySilos.calcProdejValue) ──
      function calcDilnaValue(weekHours: number, projectId: string): number {
        const proj = projMap.get(projectId);
        let prodejniCena = proj?.prodejni_cena ?? 0;
        if (!prodejniCena || prodejniCena <= 0 || weekHours <= 0) return 0;
        if (proj?.currency === 'EUR' && exchangeRates.length > 0) {
          const projYear = proj.created_at ? new Date(proj.created_at).getFullYear() : new Date().getFullYear();
          const sorted = [...exchangeRates].sort((a, b) => b.year - a.year);
          const eurRate = sorted.find(r => r.year === projYear)?.eur_czk ?? sorted[0]?.eur_czk ?? 25;
          prodejniCena = prodejniCena * eurRate;
        }
        const planH = planHoursMap.get(projectId) ?? 0;
        const realH = realHoursLifetimeMap.get(projectId) ?? 0;
        const denom = Math.max(planH, realH);
        if (denom <= 0) return 0;
        return (weekHours / denom) * prodejniCena;
      }

      const cards: ProjectCard[] = [];

      // 1) Scheduled (planned) projects — primary cards
      for (const [pid, plannedHours] of scheduledProjects) {
        const proj = projMap.get(pid);
        const isUnmatched = !proj;
        const loggedHours = hoursByProject.get(pid) || 0;
        const trackedPct = plannedHours > 0 ? Math.round((loggedHours / plannedHours) * 100) : 0;
        const completionPct = latestPctByProject.has(pid) ? latestPctByProject.get(pid)! : null;
        const expectedPctVal = isUnmatched ? null : expectedFor(pid, plannedHours);
        const isSpilled = spilledProjects.has(pid);

        // Build bundle rows (sorted by bundle_label, then split_part, then position)
        const bMap = bundlesByProject.get(pid);
        const bundleRows: BundleRow[] = [];
        if (bMap) {
          const arr = Array.from(bMap.values()).sort((a, b) => {
            const la = a.bundle_label || "Z";
            const lb = b.bundle_label || "Z";
            if (la !== lb) return la.localeCompare(lb);
            const sa = a.split_part ?? 0;
            const sb = b.split_part ?? 0;
            if (sa !== sb) return sa - sb;
            return a.position - b.position;
          });
          for (const b of arr) {
            const label = b.bundle_label || "A";
            // Match Plán Výroby / Výroba convention: "A" for full, "A-5" for split parts
            const displayLabel = b.bundle_type === "split" && b.split_part
              ? `${label}-${b.split_part}`
              : label;
            const bExpected = isUnmatched ? null : expectedForBundle(b.split_group_id, pid);
            // Per-bundle completion currently shares project-level daily log (single bundle_id per project per week)
            const bCompletion = completionPct;
            // Slip color is computed against 100 % week target (matches legend "pod plánem"); teal marker shows today's expected separately
            const bSlip = isUnmatched ? "none" : computeSlip(bCompletion, 100, loggedHours, isSpilled);
            bundleRows.push({
              bundleId: b.bundleId,
              displayLabel,
              scheduledHours: b.scheduled_hours,
              expectedPct: bExpected,
              completionPct: bCompletion,
              slipStatus: bSlip,
            });
          }
        }

        // Project-level slip = worst bundle status (or fallback to project-level)
        const slipRankMap: Record<SlipStatus, number> = { none: 0, ok: 1, slip: 2, delay: 3 };
        const projectSlip: SlipStatus = bundleRows.length > 0
          ? bundleRows.reduce<SlipStatus>((worst, br) =>
              slipRankMap[br.slipStatus] > slipRankMap[worst] ? br.slipStatus : worst, "none")
          : (isUnmatched ? "none" : computeSlip(completionPct, expectedPctVal, loggedHours, isSpilled));

        // If all bundles for this week are completed but logged < planned,
        // credit the remaining planned hours toward this week's value (project closed for the week).
        const allDoneThisWeek = projectAllDoneThisWeek.get(pid) === true;
        const valueHours = allDoneThisWeek && loggedHours < plannedHours ? plannedHours : loggedHours;
        const valueCzk = isUnmatched ? 0 : calcDilnaValue(valueHours, pid);
        const valueTargetCzk = isUnmatched ? 0 : calcDilnaValue(plannedHours, pid);

        const usekMap = usekByProject.get(pid);
        const usekBreakdown = usekMap
          ? Array.from(usekMap.values()).sort((a, b) => usekSortKey(a.kod) - usekSortKey(b.kod))
          : [];

        cards.push({
          projectId: pid,
          projectName: isUnmatched ? "Nespárované" : (proj?.project_name || pid),
          warning: isUnmatched ? "unmatched" : "none",
          plannedHours,
          loggedHours,
          trackedPct,
          completionPct,
          expectedPct: expectedPctVal,
          slipStatus: projectSlip,
          valueCzk,
          valueTargetCzk,
          bundles: bundleRows,
          usekBreakdown,
        });
      }

      // 2) Unmatched: hours logged this week to a project_id with no schedule and no project record
      for (const [pid, loggedHours] of hoursByProject) {
        if (scheduledProjects.has(pid)) continue;
        if (knownProjectIds.has(pid)) continue;
        if (loggedHours < 0.05) continue;
        const usekMap = usekByProject.get(pid);
        const usekBreakdown = usekMap
          ? Array.from(usekMap.values()).sort((a, b) => usekSortKey(a.kod) - usekSortKey(b.kod))
          : [];
        cards.push({
          projectId: pid,
          projectName: "Nespárované",
          warning: "unmatched",
          plannedHours: 0,
          loggedHours,
          trackedPct: 0,
          completionPct: null,
          expectedPct: null,
          slipStatus: "none",
          valueCzk: 0,
          valueTargetCzk: 0,
          bundles: [],
          usekBreakdown,
        });
      }

      // 3) Off-plan: project IS in DB (matched), has hours this week, but is not in production_schedule
      for (const [pid, loggedHours] of hoursByProject) {
        if (scheduledProjects.has(pid)) continue;
        if (!knownProjectIds.has(pid)) continue;
        if (loggedHours < 0.05) continue;
        const proj = projMap.get(pid)!;
        const usekMap = usekByProject.get(pid);
        const usekBreakdown = usekMap
          ? Array.from(usekMap.values()).sort((a, b) => usekSortKey(a.kod) - usekSortKey(b.kod))
          : [];
        const valueCzk = calcDilnaValue(loggedHours, pid);
        cards.push({
          projectId: pid,
          projectName: proj.project_name || pid,
          warning: "off_plan",
          plannedHours: 0,
          loggedHours,
          trackedPct: 0,
          completionPct: null,
          expectedPct: null,
          slipStatus: "none",
          valueCzk,
          valueTargetCzk: 0,
          bundles: [],
          usekBreakdown,
        });
      }

      // Sort: delays → slips → ok → off_plan → unmatched → none
      const slipRank: Record<SlipStatus, number> = { delay: 0, slip: 1, ok: 2, none: 5 };
      const warningRank: Record<CardWarning, number> = { none: 0, off_plan: 3, unmatched: 4 };
      cards.sort((a, b) => {
        const aRank = a.warning === "none" ? slipRank[a.slipStatus] : warningRank[a.warning];
        const bRank = b.warning === "none" ? slipRank[b.slipStatus] : warningRank[b.warning];
        if (aRank !== bRank) return aRank - bRank;
        return b.loggedHours - a.loggedHours;
      });

      const offPlanCount = cards.filter(c => c.warning === "off_plan").length;
      const unmatchedCount = cards.filter(c => c.warning === "unmatched").length;
      const delayCount = cards.filter(c => c.slipStatus === "delay").length;
      const slipCount = cards.filter(c => c.slipStatus === "slip").length;
      const totalValueCzk = cards.reduce((s, c) => s + (c.valueCzk || 0), 0);
      const totalValueTargetCzk = cards.reduce((s, c) => s + (c.valueTargetCzk || 0), 0);

      return {
        weekInfo,
        weeklyCapacity,
        totalHoursWeek,
        todayHours,
        dailyTarget: weeklyCapacity / 5,
        lastSync,
        cards,
        offPlanCount,
        unmatchedCount,
        delayCount,
        slipCount,
        totalValueCzk,
        totalValueTargetCzk,
      };
    },
    staleTime: 60_000,
  });
}

/** Compute slip status using completion-% vs expected-% (aligned with Vyroba module). */
function computeSlip(
  completionPct: number | null,
  expectedPct: number | null,
  loggedHours: number,
  isSpilled: boolean,
): SlipStatus {
  if (isSpilled) return "delay";
  if (loggedHours <= 0 && expectedPct === null) return "none";
  if (completionPct == null) return "none";
  const ref = expectedPct ?? 100;
  if (completionPct >= ref - SLIP_OK_TOL) return "ok";
  if (completionPct >= ref - SLIP_RED) return "slip";
  return "delay";
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

// Color for production value vs target: green ≥100% of plan, amber 95-99%, red <95%
function valueColorClass(real: number, target: number): string {
  if (target <= 0) return "text-[#2f6f2c]";
  const ratio = real / target;
  if (ratio >= 1) return "text-[#2f6f2c]";
  if (ratio >= 0.95) return "text-[#b65d05]";
  return "text-[#b1232f]";
}

function warningLabel(w: CardWarning): string {
  if (w === "off_plan") return "Mimo Plán výroby";
  if (w === "unmatched") return "Nespárované";
  return "";
}

function warningPillClass(w: CardWarning): string {
  if (w === "off_plan") return "bg-amber-100 text-amber-800 border border-amber-300";
  if (w === "unmatched") return "bg-slate-200 text-slate-700 border border-slate-300";
  return "";
}

function warningBorderColor(w: CardWarning, projectColor: string): string {
  if (w === "off_plan") return "#d97706";
  if (w === "unmatched") return "#94a3b8";
  return projectColor;
}

/* ── component ───────────────────────────────────────────────────── */

export function DilnaDashboard({ weekOffset, onOpenProjectDetail }: { weekOffset: number; onOpenProjectDetail?: (projectId: string) => void }) {
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

  const { weeklyCapacity, totalHoursWeek, todayHours, dailyTarget, lastSync, cards, offPlanCount, unmatchedCount, delayCount, slipCount, totalValueCzk, totalValueTargetCzk } = data;
  const weekPct = weeklyCapacity > 0 ? Math.min(100, Math.round((totalHoursWeek / weeklyCapacity) * 100)) : 0;
  const todayPct = dailyTarget > 0 ? Math.min(100, Math.round((todayHours / dailyTarget) * 100)) : 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Summary cards (matches VykazReport) */}
        <div className="px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <div className="text-[11px] text-muted-foreground mt-2">Z {cards.filter(c => c.warning === "none").length} naplánovaných projektů</div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Mimo plán / Nespárované</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              <span className="text-[#b65d05]">{offPlanCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-slate-600">{unmatchedCount}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              Aktualizováno {fmtTimestamp(lastSync)}
            </div>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hodnota výroby</div>
            <div className="flex items-baseline gap-2 mt-1">
              <div className={`text-2xl font-bold tabular-nums ${valueColorClass(totalValueCzk, totalValueTargetCzk)}`}>
                {fmtMCzk(totalValueCzk)}
              </div>
              <div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                / cíl {fmtMCzk(totalValueTargetCzk)}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">Reálne odpracované / plán týždne</div>
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


                  return (
                    <div
                      key={card.projectId}
                      className="bg-background rounded-lg border border-border/60 p-3 flex flex-col gap-2"
                      style={{ borderLeftWidth: 3, borderLeftColor: warningBorderColor(card.warning, projectColor) }}
                    >
                      {/* Top: name + slip badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {card.warning === "unmatched" ? (
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
                        {card.warning === "off_plan" ? (
                          <span className={cn(
                            "shrink-0 text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap",
                            warningPillClass(card.warning)
                          )}>
                            <AlertCircle className="w-3 h-3" /> {warningLabel(card.warning)}
                          </span>
                        ) : card.warning === "none" && (
                          <span className={cn(
                            "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
                            slipPillClass(card.slipStatus)
                          )}>
                            {slipLabel(card.slipStatus)}
                          </span>
                        )}
                      </div>

                      {/* Bundle rows — per-bundle completion vs expected */}
                      {card.bundles.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {card.bundles.map((b) => {
                            const bStyles = slipBarStyles(b.slipStatus);
                            return (
                              <div key={b.bundleId} className="flex items-center gap-2 text-[11px]">
                                <div className="w-14 font-medium tabular-nums truncate shrink-0" title={b.displayLabel}>
                                  {b.displayLabel}
                                </div>
                                <div className="flex-1 relative h-[6px] rounded-full bg-muted overflow-visible">
                                  {b.completionPct != null && (
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, b.completionPct))}%`,
                                        background: bStyles.bg,
                                      }}
                                    />
                                  )}
                                  {b.expectedPct != null && (
                                    <div
                                      className="absolute top-[-2px] bottom-[-2px] w-[1.5px] rounded-sm bg-teal-500 shadow-sm pointer-events-none"
                                      style={{ left: `${Math.min(100, Math.max(0, b.expectedPct))}%` }}
                                    />
                                  )}
                                </div>
                                <div className="w-9 text-right tabular-nums text-muted-foreground shrink-0">
                                  {b.completionPct != null ? `${Math.round(b.completionPct)}%` : "—"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : card.warning === "off_plan" || card.warning === "unmatched" ? null : (
                        <div className="text-[11px] text-muted-foreground italic">Bez bundlu</div>
                      )}

                      {/* Stats row — value (real / cíl) on the right */}
                      <div className="flex items-end justify-between gap-2 mt-auto">
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          <span className="font-medium text-foreground">{fmtHours(card.loggedHours)} h</span>
                          <span className="mx-1">/</span>
                          <span>plán {fmtHours(card.plannedHours)} h</span>
                        </div>
                        {card.valueCzk > 0 && (
                          <div className="text-right">
                            <div className={`text-base font-semibold tabular-nums ${valueColorClass(card.valueCzk, card.valueTargetCzk)} leading-tight`}>
                              {fmtMCzk(card.valueCzk)}
                            </div>
                            {card.valueTargetCzk > 0 && (
                              <div className="text-[10px] text-muted-foreground tabular-nums leading-tight">
                                cíl {fmtMCzk(card.valueTargetCzk)}
                              </div>
                            )}
                          </div>
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
                                    backgroundColor: warningBorderColor(card.warning, projectColor),
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
            V plánu (na pláne nebo nad)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(90deg, #fcd34d, #d97706)" }} />
            Ve skluzu (do 5 % pod plánem)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(90deg, #fca5a5, #dc3545)" }} />
            V omeškání (více než 5 % pod plánem)
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
