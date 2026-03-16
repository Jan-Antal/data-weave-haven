import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global realtime subscription that syncs data across all connected users.
 * Call once at app root level. Uses targeted cache updates for UPDATE events
 * so popups (whose open state lives in parent useState) are NOT disrupted.
 * Only INSERT/DELETE trigger full invalidation.
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

      // Projects — targeted cache patch for UPDATE, invalidate for INSERT/DELETE
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects" },
        (payload) => {
          queryClient.getQueriesData({ queryKey: ["projects"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old?.map((p: any) =>
                p.project_id === (payload.new as any)?.project_id
                  ? { ...p, ...payload.new }
                  : p
              ) ?? old
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "projects" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "projects" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
      )

      // Project stages — targeted patch for UPDATE
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "project_stages" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.setQueryData(["project_stages"], (old: any[] | undefined) =>
            old?.map((s) => s.id === newData?.id ? { ...s, ...newData } : s) ?? old
          );
          queryClient.setQueryData(["all_project_stages"], (old: any[] | undefined) =>
            old?.map((s) => s.id === newData?.id ? { ...s, ...newData } : s) ?? old
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_stages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["project_stages"] });
          queryClient.invalidateQueries({ queryKey: ["all_project_stages"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "project_stages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["project_stages"] });
          queryClient.invalidateQueries({ queryKey: ["all_project_stages"] });
        }
      )

      // Production schedule — targeted patch for UPDATE
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_schedule" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.setQueryData(["production-schedule"], (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_schedule" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-schedule"] });
          queryClient.invalidateQueries({ queryKey: ["production-progress"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_schedule" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-schedule"] });
          queryClient.invalidateQueries({ queryKey: ["production-progress"] });
        }
      )

      // Daily logs — targeted patch for UPDATE
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_daily_logs" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.setQueryData(["production-daily-logs"], (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_daily_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-daily-logs"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_daily_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production-daily-logs"] });
        }
      )

      // QC checks
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_quality_checks" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.setQueryData(["quality-checks"], (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_quality_checks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-checks"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_quality_checks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-checks"] });
        }
      )

      // QC defects
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_quality_defects" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.setQueryData(["quality-defects"], (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_quality_defects" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-defects"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_quality_defects" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["quality-defects"] });
        }
      )

      // TPV items — targeted patch for UPDATE
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tpv_items" },
        (payload) => {
          const newData = payload.new as any;
          const patchCache = (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old;
          queryClient.setQueryData(["tpv-items"], patchCache);
          queryClient.setQueryData(["tpv_items"], patchCache);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tpv_items" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tpv-items"] });
          queryClient.invalidateQueries({ queryKey: ["tpv_items"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tpv_items" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tpv-items"] });
          queryClient.invalidateQueries({ queryKey: ["tpv_items"] });
        }
      )

      // Activity log — live feed for DataLog panel (INSERT only)
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
