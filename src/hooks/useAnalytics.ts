import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Balik = "DONE" | "IN_PROGRESS" | "OVER";
export type Trend = "ok" | "warning" | "over";

export type PlanSource = "TPV" | "Project" | "None" | null;

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
  plan_source: PlanSource;
  preset_label: string;
  warning_low_tpv: boolean;
  force_project_price: boolean;
}

export interface AnalyticsSummary {
  totalPlan: number;
  totalSkutocne: number;
  avgPct: number | null;
  countDone: number;
  countInProgress: number;
  countOver: number;
  lastSync: string | null;
}

const DONE_STATUSES = ["Expedice", "Montáž", "Předání", "Fakturace", "Dokončeno"];

export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [hoursRes, projectsRes, planHoursRes, presetsRes] = await Promise.all([
        supabase
          .from("production_hours_log")
          .select("ami_project_id, hodiny, datum_sync"),
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
      ]);

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

      // Build actual hours from production_hours_log
      interface HoursAgg {
        skutocne: number;
        tracking_od: string | null;
        tracking_do: string | null;
      }
      const hoursMap = new Map<string, HoursAgg>();
      if (hoursRes.data) {
        for (const r of hoursRes.data) {
          const pid = r.ami_project_id;
          if (!pid) continue;
          const existing = hoursMap.get(pid);
          const val = Number(r.hodiny || 0);
          const sync = r.datum_sync;
          if (!existing) {
            hoursMap.set(pid, {
              skutocne: val,
              tracking_od: sync,
              tracking_do: sync,
            });
          } else {
            existing.skutocne += val;
            if (sync && (!existing.tracking_od || sync < existing.tracking_od))
              existing.tracking_od = sync;
            if (sync && (!existing.tracking_do || sync > existing.tracking_do))
              existing.tracking_do = sync;
          }
        }
      }

      // Merge
      const rows: AnalyticsRow[] = [];
      let lastSync: string | null = null;

      for (const [pid, h] of hoursMap) {
        const proj = projectsMap.get(pid);
        const name = proj?.project_name || h.project_name;
        const status = proj?.status || h.status;
        const pm = proj?.pm || h.pm;

        const plan = planMap.get(pid);
        const hodiny_plan = plan?.hodiny_plan ?? null;
        const plan_source = plan?.source as PlanSource ?? null;
        const warning_low_tpv = plan?.warning_low_tpv ?? false;
        const force_project_price = plan?.force_project_price ?? proj?.plan_use_project_price ?? false;

        const hodiny_skutocne = h.skutocne;

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

        if (h.tracking_do && (!lastSync || h.tracking_do > lastSync))
          lastSync = h.tracking_do;

        // Resolve preset label
        let preset_label = "Default";
        if (proj) {
          if (proj.cost_is_custom) {
            preset_label = "Custom";
          } else if (proj.cost_preset_id) {
            const matchedPreset = presets.find((p: any) => p.id === proj.cost_preset_id);
            preset_label = matchedPreset?.name || "Default";
          } else {
            const defaultPreset = presets.find((p: any) => p.is_default);
            preset_label = defaultPreset ? defaultPreset.name : "Default";
          }
        }

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
          tracking_od: h.tracking_od,
          tracking_do: h.tracking_do,
          plan_source,
          preset_label,
          warning_low_tpv,
          force_project_price,
        });
      }

      const totalPlan = rows.reduce((s, r) => s + (r.hodiny_plan || 0), 0);
      const totalSkutocne = rows.reduce((s, r) => s + r.hodiny_skutocne, 0);
      const withPlan = rows.filter((r) => r.pct != null);
      const avgPct = withPlan.length
        ? Math.round(
            (withPlan.reduce((s, r) => s + r.pct!, 0) / withPlan.length) * 10
          ) / 10
        : null;

      const summary: AnalyticsSummary = {
        totalPlan,
        totalSkutocne,
        avgPct,
        countDone: rows.filter((r) => r.balik === "DONE").length,
        countInProgress: rows.filter((r) => r.balik === "IN_PROGRESS").length,
        countOver: rows.filter((r) => r.balik === "OVER").length,
        lastSync,
      };

      return { rows, summary };
    },
    staleTime: 5 * 60 * 1000,
  });
}
