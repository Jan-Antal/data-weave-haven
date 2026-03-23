import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global realtime subscription that syncs data across all connected users.
 * Uses setQueryData for ALL events (INSERT/UPDATE/DELETE) — zero HTTP re-fetches.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("global-sync")

      // ━━━ PROJECTS ━━━
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
        (payload) => {
          const newRow = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["projects"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old ? [...old, newRow] : [newRow]
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "projects" },
        (payload) => {
          const deletedId = (payload.old as any)?.project_id;
          if (!deletedId) return;
          queryClient.getQueriesData({ queryKey: ["projects"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old?.filter((p) => p.project_id !== deletedId) ?? old
            );
          });
        }
      )

      // ━━━ PROJECT STAGES ━━━
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
        (payload) => {
          const newRow = payload.new as any;
          const append = (old: any[] | undefined) => old ? [...old, newRow] : [newRow];
          queryClient.setQueryData(["project_stages"], append);
          queryClient.setQueryData(["all_project_stages"], append);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "project_stages" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          const filter = (old: any[] | undefined) => old?.filter((s) => s.id !== deletedId) ?? old;
          queryClient.setQueryData(["project_stages"], filter);
          queryClient.setQueryData(["all_project_stages"], filter);
        }
      )

      // ━━━ PRODUCTION SCHEDULE ━━━
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_schedule" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["production-schedule"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_schedule" },
        (payload) => {
          const newRow = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["production-schedule"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old ? [...old, newRow] : [newRow]
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_schedule" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          queryClient.getQueriesData({ queryKey: ["production-schedule"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old?.filter((item) => item.id !== deletedId) ?? old
            );
          });
        }
      )

      // ━━━ DAILY LOGS ━━━
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "production_daily_logs" },
        (payload) => {
          const newData = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["production-daily-logs"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any) => {
              if (old instanceof Map) {
                const newMap = new Map(old);
                for (const [bundleId, logs] of newMap) {
                  newMap.set(bundleId, (logs as any[]).map((l: any) =>
                    l.id === newData?.id ? { ...l, ...newData } : l
                  ));
                }
                return newMap;
              }
              return old;
            });
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_daily_logs" },
        (payload) => {
          const newRow = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["production-daily-logs"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any) => {
              if (!(old instanceof Map)) return old;
              const newMap = new Map(old);
              const existing = newMap.get(newRow.bundle_id) || [];
              newMap.set(newRow.bundle_id, [...existing, newRow]);
              return newMap;
            });
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_daily_logs" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          queryClient.getQueriesData({ queryKey: ["production-daily-logs"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any) => {
              if (!(old instanceof Map)) return old;
              const newMap = new Map(old);
              for (const [bundleId, logs] of newMap) {
                newMap.set(bundleId, (logs as any[]).filter((l: any) => l.id !== deletedId));
              }
              return newMap;
            });
          });
        }
      )

      // ━━━ QC CHECKS ━━━
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
        (payload) => {
          const newRow = payload.new as any;
          queryClient.setQueryData(["quality-checks"], (old: any[] | undefined) =>
            old ? [...old, newRow] : [newRow]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_quality_checks" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          queryClient.setQueryData(["quality-checks"], (old: any[] | undefined) =>
            old?.filter((item) => item.id !== deletedId) ?? old
          );
        }
      )

      // ━━━ QC DEFECTS ━━━
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
        (payload) => {
          const newRow = payload.new as any;
          queryClient.setQueryData(["quality-defects"], (old: any[] | undefined) =>
            old ? [...old, newRow] : [newRow]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_quality_defects" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          queryClient.setQueryData(["quality-defects"], (old: any[] | undefined) =>
            old?.filter((item) => item.id !== deletedId) ?? old
          );
        }
      )

      // ━━━ TPV ITEMS ━━━
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tpv_items" },
        (payload) => {
          const newData = payload.new as any;
          const patchCache = (old: any[] | undefined) =>
            old?.map((item) => item.id === newData?.id ? { ...item, ...newData } : item) ?? old;
          queryClient.setQueryData(["tpv-items"], patchCache);
          queryClient.setQueryData(["tpv_items"], patchCache);
          queryClient.setQueryData(["all_tpv_items"], patchCache);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tpv_items" },
        (payload) => {
          const newRow = payload.new as any;
          const append = (old: any[] | undefined) => old ? [...old, newRow] : [newRow];
          queryClient.getQueriesData({ queryKey: ["tpv_items"] }).forEach(([key]) => {
            queryClient.setQueryData(key, append);
          });
          queryClient.setQueryData(["tpv-items"], append);
          queryClient.setQueryData(["all_tpv_items"], append);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tpv_items" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          const filter = (old: any[] | undefined) => old?.filter((item) => item.id !== deletedId) ?? old;
          queryClient.getQueriesData({ queryKey: ["tpv_items"] }).forEach(([key]) => {
            queryClient.setQueryData(key, filter);
          });
          queryClient.setQueryData(["tpv-items"], filter);
          queryClient.setQueryData(["all_tpv_items"], filter);
        }
      )

      // ━━━ PRODUCTION INBOX ━━━
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "production_inbox" },
        (payload) => {
          const newRow = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["production-inbox"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old ? [...old, newRow] : [newRow]
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "production_inbox" },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          queryClient.getQueriesData({ queryKey: ["production-inbox"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old?.filter((item) => item.id !== deletedId) ?? old
            );
          });
        }
      )

      // ━━━ ACTIVITY LOG ━━━
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "data_log" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["activity-log"] });
          queryClient.invalidateQueries({ queryKey: ["mobile-recent-activity"] });
        }
      )

      // ━━━ NOTIFICATIONS ━━━
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newRow = payload.new as any;
          queryClient.getQueriesData({ queryKey: ["notifications"] }).forEach(([key]) => {
            queryClient.setQueryData(key, (old: any[] | undefined) =>
              old ? [newRow, ...old] : [newRow]
            );
          });
        }
      )

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.info('[Realtime] Connected');
        if (status === 'CHANNEL_ERROR') console.warn('[Realtime] Channel error, will reconnect automatically');
        if (status === 'TIMED_OUT') console.warn('[Realtime] Timed out, will retry');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
