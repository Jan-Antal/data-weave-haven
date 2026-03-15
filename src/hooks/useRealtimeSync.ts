import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global realtime subscription that syncs data across all connected users.
 * Call once at app root level. Uses targeted cache invalidation so popups
 * (whose open state lives in parent useState) are NOT disrupted.
 *
 * Realtime is enabled on: projects, project_stages, production_schedule,
 * production_daily_logs, production_quality_checks, production_quality_defects,
 * tpv_items, data_log
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("global-sync")

      // Projects — optimistic patch + background refetch
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        (payload) => {
          if (payload.new && payload.eventType !== "DELETE") {
            queryClient.setQueryData(["projects"], (old: any[] | undefined) =>
              old?.map((p) =>
                p.project_id === (payload.new as any)?.project_id
                  ? { ...p, ...payload.new }
                  : p
              ) ?? old
            );
          }
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
      )

      // Project stages
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_stages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["project_stages"] });
          queryClient.invalidateQueries({ queryKey: ["all_project_stages"] });
        }
      )

      // Production schedule
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_schedule" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-schedule"] });
          queryClient.invalidateQueries({ queryKey: ["production-progress"] });
        }
      )

      // Daily logs
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_daily_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-daily-logs"] });
        }
      )

      // QC checks
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_quality_checks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-checks"] });
        }
      )

      // QC defects
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_quality_defects" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-defects"] });
        }
      )

      // TPV items
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tpv_items" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tpv-items"] });
          queryClient.invalidateQueries({ queryKey: ["tpv_items"] });
        }
      )

      // Activity log — live feed for DataLog panel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "data_log" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["activity-log"] });
          queryClient.invalidateQueries({ queryKey: ["mobile-recent-activity"] });
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
