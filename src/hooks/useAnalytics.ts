import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Balik = "DONE" | "IN_PROGRESS" | "OVER";
export type Trend = "ok" | "warning" | "over";

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
      const [scheduleRes, inboxRes, hoursRes, projectsRes, tpvRes, settingsRes, presetsRes] = await Promise.all([
        supabase
          .from("production_schedule")
          .select("project_id, scheduled_hours"),
        supabase
          .from("production_inbox")
          .select("project_id, estimated_hours"),
        supabase
          .from("production_hours_log")
          .select("ami_project_id, project_name, status, pm, hodiny_skutocne, datum_sync"),
        supabase
          .from("projects")
          .select("project_id, project_name, status, pm, marze, cost_production_pct, cost_preset_id")
          .is("deleted_at", null),
        supabase
          .from("tpv_items")
          .select("project_id, cena, pocet, status")
          .is("deleted_at", null),
        supabase
          .from("production_settings")
          .select("hourly_rate")
          .limit(1)
          .single(),
        supabase
          .from("cost_breakdown_presets")
          .select("id, is_default, production_pct"),
      ]);

      const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
      const presets = presetsRes.data || [];

      // Build fallback plan map from schedule+inbox
      const fallbackPlanMap = new Map<string, number>();
      if (scheduleRes.data) {
        for (const r of scheduleRes.data) {
          fallbackPlanMap.set(r.project_id, (fallbackPlanMap.get(r.project_id) || 0) + Number(r.scheduled_hours || 0));
        }
      }
      if (inboxRes.data) {
        for (const r of inboxRes.data) {
          fallbackPlanMap.set(r.project_id, (fallbackPlanMap.get(r.project_id) || 0) + Number(r.estimated_hours || 0));
        }
      }

      // Build projects lookup (need marze, cost_production_pct, cost_preset_id)
      const projectsDetailMap = new Map<string, { project_name: string; status: string | null; pm: string | null; marze: string | null; cost_production_pct: number | null; cost_preset_id: string | null }>();
      if (projectsRes.data) {
        for (const p of projectsRes.data) {
          projectsDetailMap.set(p.project_id, {
            project_name: p.project_name,
            status: p.status,
            pm: p.pm,
            marze: p.marze,
            cost_production_pct: p.cost_production_pct,
            cost_preset_id: p.cost_preset_id,
          });
        }
      }

      // Compute tpv-based plan hours per project
      const tpvPlanMap = new Map<string, number>();
      if (tpvRes.data) {
        // Group tpv items by project_id, skip cancelled
        const tpvByProject = new Map<string, typeof tpvRes.data>();
        for (const item of tpvRes.data) {
          if (item.status === "Zrušeno") continue;
          const arr = tpvByProject.get(item.project_id);
          if (arr) arr.push(item);
          else tpvByProject.set(item.project_id, [item]);
        }

        for (const [pid, items] of tpvByProject) {
          const proj = projectsDetailMap.get(pid);
          const preset = proj?.cost_preset_id
            ? presets.find((p) => p.id === proj.cost_preset_id)
            : presets.find((p) => p.is_default) || presets[0];
          const prodPct = proj?.cost_production_pct != null
            ? Number(proj.cost_production_pct) / 100
            : (preset?.production_pct ?? 30) / 100;
          const marze = proj?.marze ? Number(proj.marze) / 100 : 0;

          let total = 0;
          for (const item of items) {
            const czk = (Number(item.cena) || 0) * (Number(item.pocet) || 1);
            total += czk > 0 ? Math.floor((czk * (1 - marze) * prodPct) / hourlyRate) : 0;
          }
          if (total > 0) tpvPlanMap.set(pid, total);
        }
      }

      // Resolve hodiny_plan: tpv primary, fallback to schedule+inbox
      function getPlanHours(pid: string): number | null {
        const tpv = tpvPlanMap.get(pid);
        if (tpv != null && tpv > 0) return tpv;
        const fb = fallbackPlanMap.get(pid);
        if (fb != null && fb > 0) return fb;
        return null;
      }

      // Build actual hours map from production_hours_log grouped by ami_project_id
      interface HoursAgg {
        project_name: string;
        status: string | null;
        pm: string | null;
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
          const val = Number(r.hodiny_skutocne || 0);
          const sync = r.datum_sync;
          if (!existing) {
            hoursMap.set(pid, {
              project_name: r.project_name || pid,
              status: r.status,
              pm: r.pm,
              skutocne: val,
              tracking_od: sync,
              tracking_do: sync,
            });
          } else {
            if (val > existing.skutocne) existing.skutocne = val;
            if (sync && (!existing.tracking_od || sync < existing.tracking_od)) existing.tracking_od = sync;
            if (sync && (!existing.tracking_do || sync > existing.tracking_do)) existing.tracking_do = sync;
            // Keep latest status/pm/name
            if (r.status) existing.status = r.status;
            if (r.pm) existing.pm = r.pm;
            if (r.project_name) existing.project_name = r.project_name;
          }
        }
      }

      // Build projects lookup
      const projectsMap = new Map<string, { project_name: string; status: string | null; pm: string | null }>();
      if (projectsRes.data) {
        for (const p of projectsRes.data) {
          projectsMap.set(p.project_id, { project_name: p.project_name, status: p.status, pm: p.pm });
        }
      }

      // Merge: iterate over hoursMap (projects with actual hours)
      const rows: AnalyticsRow[] = [];
      let lastSync: string | null = null;

      for (const [pid, h] of hoursMap) {
        const proj = projectsMap.get(pid);
        const name = proj?.project_name || h.project_name;
        const status = proj?.status || h.status;
        const pm = proj?.pm || h.pm;

        const plan = planMap.get(pid);
        const hodiny_plan = plan != null && plan > 0 ? plan : null;
        const hodiny_skutocne = h.skutocne;

        const pct = hodiny_plan ? Math.round((hodiny_skutocne / hodiny_plan) * 1000) / 10 : null;
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

        if (h.tracking_do && (!lastSync || h.tracking_do > lastSync)) lastSync = h.tracking_do;

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
        });
      }

      const totalPlan = rows.reduce((s, r) => s + (r.hodiny_plan || 0), 0);
      const totalSkutocne = rows.reduce((s, r) => s + r.hodiny_skutocne, 0);
      const withPlan = rows.filter((r) => r.pct != null);
      const avgPct = withPlan.length ? Math.round((withPlan.reduce((s, r) => s + r.pct!, 0) / withPlan.length) * 10) / 10 : null;

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
