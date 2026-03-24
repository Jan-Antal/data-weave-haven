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
    queryKey: ["analytics-plan-vs-reality"],
    queryFn: async () => {
      const [scheduleRes, inboxRes, hoursRes, projectsRes] = await Promise.all([
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
          .select("project_id, project_name, status, pm")
          .is("deleted_at", null),
      ]);

      // Build plan map: project_id -> total plan hours
      const planMap = new Map<string, number>();
      if (scheduleRes.data) {
        for (const r of scheduleRes.data) {
          planMap.set(r.project_id, (planMap.get(r.project_id) || 0) + Number(r.scheduled_hours || 0));
        }
      }
      if (inboxRes.data) {
        for (const r of inboxRes.data) {
          planMap.set(r.project_id, (planMap.get(r.project_id) || 0) + Number(r.estimated_hours || 0));
        }
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
