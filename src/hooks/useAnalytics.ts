import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Balik = "DONE" | "IN_PROGRESS" | "OVER";
export type Trend = "ok" | "warning" | "over";

export type PlanSource = "TPV" | "Project" | "None" | null;
export type RowCategory = "project" | "rezie" | "unmatched";

export type TimeRange = "week" | "month" | "3months" | "year" | "all";

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
  rezieByCode: Record<string, number>;
  // ── New windowed utilization (pure hours-based) ──
  // Utilization = (Výrobní hodiny − Režijní hodiny) / Výrobní hodiny
  utilizationPct: number | null;
  totalHoursWindow: number;       // sum of production hours (excl TPV/ENG/PRO) in window
  overheadHoursWindow: number;    // sum of overhead-coded hours in window
  productiveHoursWindow: number;  // total − overhead
}

function isExcludedActivityCode(code: string | null | undefined): boolean {
  return !!code && ["TPV", "ENG", "PRO"].includes(code);
}

const DONE_STATUSES = ["Expedice", "Montáž", "Předání", "Fakturace", "Dokončeno"];

function getRangeStart(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  const d = new Date(now);
  if (range === "week") {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
  } else if (range === "month") {
    d.setDate(1);
  } else if (range === "3months") {
    d.setMonth(d.getMonth() - 3);
  } else if (range === "year") {
    d.setFullYear(d.getFullYear() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useAnalytics(timeRange: TimeRange = "3months") {
  return useQuery({
    queryKey: ["analytics", "utilization-v6", timeRange],
    queryFn: async () => {
      const rangeStart = getRangeStart(timeRange);

      const [hoursRes, projectsRes, planHoursRes, presetsRes, scheduleRes, overheadRes, settingsRes, windowLogsRes] = await Promise.all([
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
          .select("utilization_pct, weekly_capacity_hours")
          .limit(1)
          .maybeSingle(),
        (() => {
          let q = supabase
            .from("production_hours_log")
            .select("ami_project_id, hodiny, cinnost_kod")
            .range(0, 99999);
          if (rangeStart) q = q.gte("datum_sync", rangeStart);
          return q;
        })(),
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
      const projectsMap = new Map<string, any>();
      if (projectsRes.data) {
        for (const p of projectsRes.data as any[]) {
          projectsMap.set(p.project_id, p);
        }
      }

      // Build actual hours from pre-aggregated RPC (lifetime — for table rows)
      interface HoursAgg { skutocne: number; tracking_od: string | null; tracking_do: string | null; }
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
          const zostatok = hodiny_plan ? Math.max(0, hodiny_plan - hodiny_skutocne) : null;

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

          if (h?.tracking_do && (!lastSync || h.tracking_do > lastSync)) lastSync = h.tracking_do;

          let preset_label = "Default";
          if (proj.cost_is_custom) preset_label = "Custom";
          else if (proj.cost_preset_id) {
            const matched = presets.find((p: any) => p.id === proj.cost_preset_id);
            preset_label = matched?.name || "Default";
          } else {
            const def = presets.find((p: any) => p.is_default);
            preset_label = def ? def.name : "Default";
          }

          const sched = scheduleMap.get(pid);

          rows.push({
            project_id: pid, project_name: name, pm, status,
            hodiny_plan, hodiny_skutocne, pct, zostatok, balik, trend,
            tracking_od: h?.tracking_od ?? null, tracking_do: h?.tracking_do ?? null,
            schedule_od: sched?.min ?? null, schedule_do: sched?.max ?? null,
            plan_source, preset_label, warning_low_tpv, force_project_price,
            unmatched: false, category: "project",
          });
        }
      }

      // Add overhead rows (lifetime)
      const knownProjectIds = new Set(projectsMap.keys());
      for (const [code, label] of overheadMap.entries()) {
        const h = hoursMap.get(code);
        const hodiny_skutocne = h?.skutocne ?? 0;
        if (h?.tracking_do && (!lastSync || h.tracking_do > lastSync)) lastSync = h.tracking_do;
        rows.push({
          project_id: code, project_name: label, pm: null, status: null,
          hodiny_plan: null, hodiny_skutocne, pct: null, zostatok: null,
          balik: "IN_PROGRESS", trend: null,
          tracking_od: h?.tracking_od ?? null, tracking_do: h?.tracking_do ?? null,
          schedule_od: null, schedule_do: null,
          plan_source: null, preset_label: "Režie",
          warning_low_tpv: false, force_project_price: false,
          unmatched: false, category: "rezie",
        });
      }

      // Unmatched ghost rows
      if (hoursRes.data) {
        for (const r of hoursRes.data as Array<{ ami_project_id: string; total_hodiny: number; min_datum: string; max_datum: string }>) {
          if (knownProjectIds.has(r.ami_project_id)) continue;
          if (overheadMap.has(r.ami_project_id)) continue;
          const skutocne = Number(r.total_hodiny || 0);
          if (skutocne < 0.05) continue;
          if (r.max_datum && (!lastSync || r.max_datum > lastSync)) lastSync = r.max_datum;
          rows.push({
            project_id: r.ami_project_id, project_name: "Nesparovaná data z Alvena",
            pm: null, status: null, hodiny_plan: null, hodiny_skutocne: skutocne,
            pct: null, zostatok: null, balik: "IN_PROGRESS", trend: null,
            tracking_od: r.min_datum || null, tracking_do: r.max_datum || null,
            schedule_od: null, schedule_do: null,
            plan_source: null, preset_label: "—",
            warning_low_tpv: false, force_project_price: false,
            unmatched: true, category: "unmatched",
          });
        }
      }

      const projectRows = rows.filter((r) => r.category === "project");
      const totalPlan = projectRows.reduce((s, r) => s + (r.hodiny_plan || 0), 0);
      const totalSkutocne = projectRows.reduce((s, r) => s + r.hodiny_skutocne, 0);
      const totalRezieHours = rows.filter((r) => r.category === "rezie").reduce((s, r) => s + r.hodiny_skutocne, 0);

      // ── Utilization in window ─────────────────────────
      // Výrobní hodiny = SUM hodiny in window, excluding TPV/ENG/PRO
      // Režijní hodiny = subset where ami_project_id ∈ overheadMap
      // Utilizace = (Výrobní − Režijní) / Výrobní
      let totalHoursWindow = 0;
      let overheadHoursWindow = 0;
      const rezieByCode: Record<string, number> = {};

      const windowLogs = (windowLogsRes.data || []) as Array<{
        ami_project_id: string;
        hodiny: number | string;
        cinnost_kod: string | null;
      }>;
      for (const log of windowLogs) {
        if (isExcludedActivityCode(log.cinnost_kod)) continue;
        const h = Number(log.hodiny) || 0;
        if (h <= 0) continue;
        totalHoursWindow += h;
        if (overheadMap.has(log.ami_project_id)) {
          overheadHoursWindow += h;
          rezieByCode[log.ami_project_id] = (rezieByCode[log.ami_project_id] || 0) + h;
        }
      }
      const productiveHoursWindow = totalHoursWindow - overheadHoursWindow;
      const utilizationPct = totalHoursWindow > 0
        ? Math.round((productiveHoursWindow / totalHoursWindow) * 1000) / 10
        : null;
      const reziePct = totalHoursWindow > 0
        ? Math.round((overheadHoursWindow / totalHoursWindow) * 1000) / 10
        : null;

      const withPlan = projectRows.filter((r) => r.pct != null);
      const avgPct = withPlan.length
        ? Math.round((withPlan.reduce((s, r) => s + r.pct!, 0) / withPlan.length) * 10) / 10
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
        totalProjectHours: totalSkutocne,
        reziePct,
        utilizationTarget,
        rezieByCode,
        utilizationPct,
        totalHoursWindow,
        overheadHoursWindow,
        productiveHoursWindow,
      };

      return { rows, summary };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });
}
