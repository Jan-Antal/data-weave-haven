import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface ProductionStatus {
  label: string;
  color: string;
  weekLabel?: string;
  splitPart?: number;
  splitTotal?: number;
}

/** Format week numbers into compact ranges: [12,13,14,17] → "T12-14, T17" */
function formatWeekRanges(weeks: number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `T${weeks[0]}`;

  const ranges: string[] = [];
  let start = weeks[0];
  let end = weeks[0];

  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === end + 1) {
      end = weeks[i];
    } else {
      ranges.push(start === end ? `T${start}` : `T${start}-${end}`);
      start = end = weeks[i];
    }
  }
  ranges.push(start === end ? `T${start}` : `T${start}-${end}`);
  return ranges.join(", ");
}

/** For a given project, compute production status per TPV nazev (code) */
export function useProductionStatuses(projectId: string) {
  const query = useQuery({
    queryKey: ["production-statuses", projectId],
    queryFn: async () => {
      const [inboxRes, scheduleRes, projectRes] = await Promise.all([
        supabase.from("production_inbox").select("item_name, item_code, status").eq("project_id", projectId),
        supabase.from("production_schedule").select("item_name, item_code, status, scheduled_week, split_part, split_total, pause_reason, pause_expected_date, cancel_reason, expediced_at").eq("project_id", projectId),
        supabase.from("projects").select("status").eq("project_id", projectId).maybeSingle(),
      ]);
      if (inboxRes.error) throw inboxRes.error;
      if (scheduleRes.error) throw scheduleRes.error;
      return {
        inbox: inboxRes.data || [],
        schedule: scheduleRes.data || [],
        projectStatus: projectRes.data?.status || null,
      };
    },
    enabled: !!projectId,
  });

  const statusMap = useMemo(() => {
    const map = new Map<string, ProductionStatus[]>();
    if (!query.data) return map;

    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);
    const currentWeekKey = monday.toISOString().split("T")[0];

    // Collect raw per-item data
    interface RawEntry {
      type: "pending" | "ve_vyrobe" | "naplan" | "zpozdeni" | "expedice_wait" | "expedovano" | "paused" | "cancelled";
      weekNum?: number;
      label?: string;
      color?: string;
      splitPart?: number;
      splitTotal?: number;
    }
    const rawMap = new Map<string, RawEntry[]>();

    for (const row of query.data.inbox) {
      const key = row.item_code || row.item_name;
      if (!rawMap.has(key)) rawMap.set(key, []);
      if (row.status === "pending") {
        rawMap.get(key)!.push({ type: "pending" });
      }
    }

    for (const row of query.data.schedule) {
      const key = row.item_code || row.item_name;
      if (!rawMap.has(key)) rawMap.set(key, []);

      if (row.status === "expedice") {
        rawMap.get(key)!.push({ type: "expedice_wait" });
      } else if (row.status === "completed") {
        rawMap.get(key)!.push({ type: "expedovano" });
      } else if (row.status === "paused") {
        const pauseReason = (row as any).pause_reason || "Pozastaveno";
        const expDate = (row as any).pause_expected_date;
        const isOverdue = expDate && new Date(expDate) < new Date();
        let label: string;
        if (isOverdue) {
          label = `⚠ ⏸ ${pauseReason} — po termínu`;
        } else {
          const expLabel = expDate ? ` · exp. ${new Date(expDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}` : "";
          label = `⏸ ${pauseReason}${expLabel}`;
        }
        rawMap.get(key)!.push({ type: "paused", label, color: isOverdue ? "#dc3545" : "#d97706" });
      } else if (row.status === "cancelled") {
        const cancelReason = (row as any).cancel_reason || "";
        rawMap.get(key)!.push({ type: "cancelled", label: `✕ Zrušeno${cancelReason ? ` · ${cancelReason}` : ""}`, color: "#6b7280" });
      } else {
        const weekKey = row.scheduled_week;
        const weekDate = new Date(weekKey);
        const dayNum = weekDate.getUTCDay() || 7;
        weekDate.setUTCDate(weekDate.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

        if (weekKey === currentWeekKey) {
          rawMap.get(key)!.push({ type: "ve_vyrobe", splitPart: row.split_part ?? undefined, splitTotal: row.split_total ?? undefined });
        } else if (weekKey > currentWeekKey) {
          rawMap.get(key)!.push({ type: "naplan", weekNum, splitPart: row.split_part ?? undefined, splitTotal: row.split_total ?? undefined });
        } else {
          rawMap.get(key)!.push({ type: "zpozdeni" });
        }
      }
    }

    // Aggregate into summary badges
    for (const [key, entries] of rawMap) {
      const statuses: ProductionStatus[] = [];

      const delayed = entries.filter(e => e.type === "zpozdeni");
      if (delayed.length > 0) {
        statuses.push({ label: delayed.length > 1 ? `△ Zpoždění (${delayed.length}×)` : "△ Zpoždění ve výrobě", color: "#dc3545" });
      }

      const veVyrobe = entries.filter(e => e.type === "ve_vyrobe");
      if (veVyrobe.length > 0) {
        statuses.push({ label: "Ve výrobě", color: "#d97706" });
      }

      const planned = entries.filter(e => e.type === "naplan");
      if (planned.length > 0) {
        const weeks = [...new Set(planned.map(e => e.weekNum!))].sort((a, b) => a - b);
        statuses.push({ label: `Naplánováno ${formatWeekRanges(weeks)}`, color: "#3b82f6" });
      }

      const pending = entries.filter(e => e.type === "pending");
      if (pending.length > 0) {
        statuses.push({ label: pending.length > 1 ? `Čeká na plánování (${pending.length}×)` : "Čeká na plánování", color: "#6b7280" });
      }

      const expediceWait = entries.filter(e => e.type === "expedice_wait");
      if (expediceWait.length > 0) {
        statuses.push({ label: "Čeká na expedici", color: "#3a8a36" });
      }

      const expedovano = entries.filter(e => e.type === "expedovano");
      if (expedovano.length > 0) {
        statuses.push({ label: "Expedováno", color: "#223937" });
      }

      // Paused and cancelled keep individual labels (unique reasons)
      for (const e of entries.filter(e => e.type === "paused" || e.type === "cancelled")) {
        statuses.push({ label: e.label!, color: e.color! });
      }

      map.set(key, statuses);
    }

    return map;
  }, [query.data]);

  return { ...query, statusMap };
}
