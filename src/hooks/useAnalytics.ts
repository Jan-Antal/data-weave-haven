import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeUsek } from "@/hooks/useCapacityCalc";

export type Balik = "DONE" | "IN_PROGRESS" | "OVER";
export type Trend = "ok" | "warning" | "over";

export type PlanSource = "TPV" | "Project" | "None" | null;
export type RowCategory = "project" | "rezie" | "unmatched";

export interface AnalyticsRow {
  project_id: string;
  project_name: string;
  pm: string | null;
  status: string | null;
  hodiny_plan: number | null;
  hodiny_skutocne: number;
  pct: number | null;
  zostatok: number | null;
  balik: Balik;
  trend: Trend | null;
  tracking_od: string | null;
  tracking_do: string | null;
  schedule_od: string | null;
  schedule_do: string | null;
  plan_source: PlanSource;
  preset_label: string;
  warning_low_tpv: boolean;
  force_project_price: boolean;
  unmatched: boolean;
  category: RowCategory;
}

export interface AnalyticsSummary {
  totalPlan: number;
  totalSkutocne: number;
  avgPct: number | null;
  countDone: number;
  countInProgress: number;
  countOver: number;
  lastSync: string | null;
  totalRezieHours: number;
  totalProjectHours: number;
  reziePct: number | null;
  utilizationTarget: number;
  // Production-staff-only utilization (Dílna 1/2/3 + Sklad) — lifetime
  productionRezieHours: number;
  productionProjectHours: number;
  rezieByCode: Record<string, number>; // overhead code → production-staff hours (lifetime)
  // Windowed utilization (production project / (project + rezie)) * 100
  utilization30d: number | null;
  utilization60to30d: number | null;
  utilization90to60d: number | null;
  utilizationMedian3m: number | null;
  utilizationTrend: "up" | "down" | "flat" | null;
  // Hours behind 30d window (for tooltip)
  productionProjectHours30d: number;
  productionRezieHours30d: number;
}

const DONE_STATUSES = ["Expedice", "Montáž", "Předání", "Fakturace", "Dokončeno"];

export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [hoursRes, projectsRes, planHoursRes, presetsRes, scheduleRes, overheadRes, settingsRes, employeesRes, rawLogsRes] = await Promise.all([
        (supabase.rpc as any)("get_hours_by_project"),
        supabase
          .from("projects")
          .select("project_id, project_name, status, pm, cost_preset_id, cost_is_custom, plan_use_project_price")
          .is("deleted_at", null),
        supabase
          .from("project_plan_hours")
          .select("*"),
        supabase
          .from("cost_breakdown_presets")
          .select("id, name, is_default"),
        supabase
          .from("production_schedule")
          .select("project_id, scheduled_week"),
        supabase
          .from("overhead_projects" as any)
          .select("project_code, label, is_active"),
        supabase
          .from("production_settings")
          .select("utilization_pct")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("ami_employees")
          .select("meno, usek, aktivny, activated_at, deactivated_at"),
        supabase
          .from("production_hours_log")
          .select("ami_project_id, hodiny, datum_sync, zamestnanec, cinnost_kod")
          .gte("datum_sync", (() => { const d = new Date(); d.setDate(d.getDate() - 100); return d.toISOString().slice(0, 10); })())
          .range(0, 49999),
      ]);

      // Build overhead lookup (active only)
      const overheadMap = new Map<string, string>();
      if (overheadRes.data) {
        for (const o of overheadRes.data as any[]) {
          if (o.is_active !== false) {
            overheadMap.set(o.project_code, o.label);
          }
        }
      }

      const utilizationTarget = Number((settingsRes.data as any)?.utilization_pct ?? 83);

      // Build schedule date range lookup
      const scheduleMap = new Map<string, { min: string; max: string }>();
      if (scheduleRes.data) {
        for (const r of scheduleRes.data as Array<{ project_id: string; scheduled_week: string }>) {
          const existing = scheduleMap.get(r.project_id);
          if (!existing) {
            scheduleMap.set(r.project_id, { min: r.scheduled_week, max: r.scheduled_week });
          } else {
            if (r.scheduled_week < existing.min) existing.min = r.scheduled_week;
            if (r.scheduled_week > existing.max) existing.max = r.scheduled_week;
          }
        }
      }

      const presets = presetsRes.data || [];

      // Build plan hours lookup
      const planMap = new Map<string, {
        hodiny_plan: number;
        source: string;
        warning_low_tpv: boolean;
        force_project_price: boolean;
      }>();
      if (planHoursRes.data) {
        for (const r of planHoursRes.data as any[]) {
          planMap.set(r.project_id, {
            hodiny_plan: Number(r.hodiny_plan) || 0,
            source: r.source || "None",
            warning_low_tpv: r.warning_low_tpv ?? false,
            force_project_price: r.force_project_price ?? false,
          });
        }
      }

      // Build projects lookup
      const projectsMap = new Map<string, {
        project_name: string;
        status: string | null;
        pm: string | null;
        cost_preset_id: string | null;
        cost_is_custom: boolean;
        plan_use_project_price: boolean;
      }>();
      if (projectsRes.data) {
        for (const p of projectsRes.data as any[]) {
          projectsMap.set(p.project_id, {
            project_name: p.project_name,
            status: p.status,
            pm: p.pm,
            cost_preset_id: p.cost_preset_id,
            cost_is_custom: p.cost_is_custom ?? false,
            plan_use_project_price: p.plan_use_project_price ?? false,
          });
        }
      }

      // Build actual hours from pre-aggregated RPC
      interface HoursAgg {
        skutocne: number;
        tracking_od: string | null;
        tracking_do: string | null;
      }
      const hoursMap = new Map<string, HoursAgg>();
      if (hoursRes.data) {
        for (const r of hoursRes.data as Array<{ ami_project_id: string; total_hodiny: number; min_datum: string; max_datum: string }>) {
          hoursMap.set(r.ami_project_id, {
            skutocne: Number(r.total_hodiny || 0),
            tracking_od: r.min_datum || null,
            tracking_do: r.max_datum || null,
          });
        }
      }

      // Merge — iterate over ALL projects as primary source
      const rows: AnalyticsRow[] = [];
      let lastSync: string | null = null;

      if (projectsRes.data) {
        for (const proj of projectsRes.data as any[]) {
          const pid = proj.project_id;
          // If project_id is mapped as overhead, it will be emitted from the overhead loop instead
          if (overheadMap.has(pid)) continue;

          const name = proj.project_name || pid;
          const status = proj.status || null;
          const pm = proj.pm || null;

          const plan = planMap.get(pid);
          const hodiny_plan = plan?.hodiny_plan ?? null;
          const plan_source = plan?.source as PlanSource ?? null;
          const warning_low_tpv = plan?.warning_low_tpv ?? false;
          const force_project_price = plan?.force_project_price ?? proj.plan_use_project_price ?? false;

          const h = hoursMap.get(pid);
          const hodiny_skutocne = h?.skutocne ?? 0;

          const pct = hodiny_plan
            ? Math.round((hodiny_skutocne / hodiny_plan) * 1000) / 10
            : null;
          const zostatok = hodiny_plan
            ? Math.max(0, hodiny_plan - hodiny_skutocne)
            : null;

          const isDone = DONE_STATUSES.includes(status || "");
          let balik: Balik = "IN_PROGRESS";
          if (isDone) balik = "DONE";
          else if (pct != null && pct > 100) balik = "OVER";

          let trend: Trend | null = null;
          if (pct != null) {
            if (pct <= 80) trend = "ok";
            else if (pct <= 100) trend = "warning";
            else trend = "over";
          }

          if (h?.tracking_do && (!lastSync || h.tracking_do > lastSync))
            lastSync = h.tracking_do;

          // Resolve preset label
          let preset_label = "Default";
          if (proj.cost_is_custom) {
            preset_label = "Custom";
          } else if (proj.cost_preset_id) {
            const matchedPreset = presets.find((p: any) => p.id === proj.cost_preset_id);
            preset_label = matchedPreset?.name || "Default";
          } else {
            const defaultPreset = presets.find((p: any) => p.is_default);
            preset_label = defaultPreset ? defaultPreset.name : "Default";
          }

          const sched = scheduleMap.get(pid);

          rows.push({
            project_id: pid,
            project_name: name,
            pm,
            status,
            hodiny_plan,
            hodiny_skutocne,
            pct,
            zostatok,
            balik,
            trend,
            tracking_od: h?.tracking_od ?? null,
            tracking_do: h?.tracking_do ?? null,
            schedule_od: sched?.min ?? null,
            schedule_do: sched?.max ?? null,
            plan_source,
            preset_label,
            warning_low_tpv,
            force_project_price,
            unmatched: false,
            category: "project",
          });
        }
      }

      // Add overhead rows (režie) — pull hours by overhead code
      const knownProjectIds = new Set(projectsMap.keys());
      for (const [code, label] of overheadMap.entries()) {
        const h = hoursMap.get(code);
        const hodiny_skutocne = h?.skutocne ?? 0;
        if (h?.tracking_do && (!lastSync || h.tracking_do > lastSync)) lastSync = h.tracking_do;
        rows.push({
          project_id: code,
          project_name: label,
          pm: null,
          status: null,
          hodiny_plan: null,
          hodiny_skutocne,
          pct: null,
          zostatok: null,
          balik: "IN_PROGRESS",
          trend: null,
          tracking_od: h?.tracking_od ?? null,
          tracking_do: h?.tracking_do ?? null,
          schedule_od: null,
          schedule_do: null,
          plan_source: null,
          preset_label: "Režie",
          warning_low_tpv: false,
          force_project_price: false,
          unmatched: false,
          category: "rezie",
        });
      }

      // Add ghost rows for unmatched AMI project IDs (logged hours without project record AND not overhead)
      if (hoursRes.data) {
        for (const r of hoursRes.data as Array<{ ami_project_id: string; total_hodiny: number; min_datum: string; max_datum: string }>) {
          if (knownProjectIds.has(r.ami_project_id)) continue;
          if (overheadMap.has(r.ami_project_id)) continue;
          const skutocne = Number(r.total_hodiny || 0);
          if (skutocne < 0.05) continue;
          if (r.max_datum && (!lastSync || r.max_datum > lastSync)) lastSync = r.max_datum;
          rows.push({
            project_id: r.ami_project_id,
            project_name: "Nesparovaná data z Alvena",
            pm: null,
            status: null,
            hodiny_plan: null,
            hodiny_skutocne: skutocne,
            pct: null,
            zostatok: null,
            balik: "IN_PROGRESS",
            trend: null,
            tracking_od: r.min_datum || null,
            tracking_do: r.max_datum || null,
            schedule_od: null,
            schedule_do: null,
            plan_source: null,
            preset_label: "—",
            warning_low_tpv: false,
            force_project_price: false,
            unmatched: true,
            category: "unmatched",
          });
        }
      }

      const projectRows = rows.filter((r) => r.category === "project");
      const totalPlan = projectRows.reduce((s, r) => s + (r.hodiny_plan || 0), 0);
      const totalSkutocne = projectRows.reduce((s, r) => s + r.hodiny_skutocne, 0);
      const totalRezieHours = rows
        .filter((r) => r.category === "rezie")
        .reduce((s, r) => s + r.hodiny_skutocne, 0);
      const totalProjectHours = totalSkutocne;

      // ── Production-staff-only utilization ─────────────────────────────
      // Build set of production employee names (Dílna 1/2/3 + Sklad), respecting active period.
      type EmpRow = { meno: string; usek: string; aktivny: boolean | null; activated_at: string | null; deactivated_at: string | null };
      const productionEmps = ((employeesRes.data || []) as EmpRow[]).filter(
        (e) => e.aktivny !== false && normalizeUsek(e.usek) !== null,
      );
      const empByName = new Map<string, EmpRow>();
      for (const e of productionEmps) empByName.set(e.meno, e);

      const knownProjectIdsForUtil = new Set(projectsMap.keys());
      let productionRezieHours = 0;
      let productionProjectHours = 0;
      const rezieByCode: Record<string, number> = {};

      const rawLogs = (rawLogsRes.data || []) as Array<{
        ami_project_id: string;
        hodiny: number | string;
        datum_sync: string;
        zamestnanec: string;
        cinnost_kod: string | null;
      }>;
      for (const log of rawLogs) {
        // Same exclusion as RPC: skip TPV / ENG / PRO activity codes
        if (log.cinnost_kod && ["TPV", "ENG", "PRO"].includes(log.cinnost_kod)) continue;
        const emp = empByName.get(log.zamestnanec);
        if (!emp) continue; // not a production worker
        // Respect active period: activated_at ≤ datum ≤ deactivated_at
        if (emp.activated_at && log.datum_sync < emp.activated_at.slice(0, 10)) continue;
        if (emp.deactivated_at && log.datum_sync > emp.deactivated_at.slice(0, 10)) continue;

        const h = Number(log.hodiny) || 0;
        if (overheadMap.has(log.ami_project_id)) {
          productionRezieHours += h;
          rezieByCode[log.ami_project_id] = (rezieByCode[log.ami_project_id] || 0) + h;
        } else if (knownProjectIdsForUtil.has(log.ami_project_id)) {
          productionProjectHours += h;
        }
        // unmatched ids are ignored for utilization
      }

      const utilDenom = productionRezieHours + productionProjectHours;
      const reziePct = utilDenom > 0
        ? Math.round((productionRezieHours / utilDenom) * 1000) / 10
        : null;

      // ── Windowed utilization (last 30d, 60-30d, 90-60d) ──────────────
      const today = new Date();
      const toLocalISO = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const dayOffset = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return toLocalISO(d);
      };
      const W0 = dayOffset(0);    // today
      const W30 = dayOffset(30);  // 30 days ago
      const W60 = dayOffset(60);
      const W90 = dayOffset(90);

      const windowAgg = { p30: 0, r30: 0, p60: 0, r60: 0, p90: 0, r90: 0 };
      for (const log of rawLogs) {
        if (log.cinnost_kod && ["TPV", "ENG", "PRO"].includes(log.cinnost_kod)) continue;
        const emp = empByName.get(log.zamestnanec);
        if (!emp) continue;
        if (emp.activated_at && log.datum_sync < emp.activated_at.slice(0, 10)) continue;
        if (emp.deactivated_at && log.datum_sync > emp.deactivated_at.slice(0, 10)) continue;

        const h = Number(log.hodiny) || 0;
        const isOverhead = overheadMap.has(log.ami_project_id);
        const isProject = !isOverhead && knownProjectIdsForUtil.has(log.ami_project_id);
        if (!isOverhead && !isProject) continue;

        const d = log.datum_sync;
        if (d > W30 && d <= W0) {
          if (isOverhead) windowAgg.r30 += h; else windowAgg.p30 += h;
        } else if (d > W60 && d <= W30) {
          if (isOverhead) windowAgg.r60 += h; else windowAgg.p60 += h;
        } else if (d > W90 && d <= W60) {
          if (isOverhead) windowAgg.r90 += h; else windowAgg.p90 += h;
        }
      }

      const pct = (proj: number, rez: number): number | null => {
        const denom = proj + rez;
        return denom > 0 ? Math.round((proj / denom) * 1000) / 10 : null;
      };
      const utilization30d = pct(windowAgg.p30, windowAgg.r30);
      const utilization60to30d = pct(windowAgg.p60, windowAgg.r60);
      const utilization90to60d = pct(windowAgg.p90, windowAgg.r90);

      const samples = [utilization30d, utilization60to30d, utilization90to60d].filter(
        (v): v is number => v != null,
      );
      let utilizationMedian3m: number | null = null;
      if (samples.length > 0) {
        const sorted = [...samples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        utilizationMedian3m = sorted.length % 2 === 0
          ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
          : sorted[mid];
      }

      let utilizationTrend: "up" | "down" | "flat" | null = null;
      if (utilization30d != null && utilizationMedian3m != null) {
        const diff = utilization30d - utilizationMedian3m;
        if (diff > 2) utilizationTrend = "up";
        else if (diff < -2) utilizationTrend = "down";
        else utilizationTrend = "flat";
      }

      const withPlan = projectRows.filter((r) => r.pct != null);
      const avgPct = withPlan.length
        ? Math.round(
            (withPlan.reduce((s, r) => s + r.pct!, 0) / withPlan.length) * 10
          ) / 10
        : null;

      const summary: AnalyticsSummary = {
        totalPlan,
        totalSkutocne,
        avgPct,
        countDone: projectRows.filter((r) => r.balik === "DONE").length,
        countInProgress: projectRows.filter((r) => r.balik === "IN_PROGRESS").length,
        countOver: projectRows.filter((r) => r.balik === "OVER").length,
        lastSync,
        totalRezieHours,
        totalProjectHours,
        reziePct,
        utilizationTarget,
        productionRezieHours,
        productionProjectHours,
        rezieByCode,
        utilization30d,
        utilization60to30d,
        utilization90to60d,
        utilizationMedian3m,
        utilizationTrend,
        productionProjectHours30d: windowAgg.p30,
        productionRezieHours30d: windowAgg.r30,
      };

      return { rows, summary };
    },
    staleTime: 5 * 60 * 1000,
  });
}
