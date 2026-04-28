import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deriveBundleSplitMeta, fallbackBundleLabel, resolveBundleType, type BundleType } from "@/lib/productionBundles";

function normalizeProductionItemCode(code: string | null | undefined): string {
  if (!code) return "";
  return code.replace(/_[a-z0-9]{1,8}$/i, "");
}

export interface ScheduleItem {
  id: string;
  project_id: string;
  project_name: string;
  stage_id: string | null;
  item_name: string;
  item_code: string | null;
  item_quantity: number | null;
  scheduled_week: string;
  scheduled_hours: number;
  scheduled_czk: number;
  position: number;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  expediced_at: string | null;
  split_group_id: string | null;
  split_part: number | null;
  split_total: number | null;
  pause_reason: string | null;
  pause_expected_date: string | null;
  adhoc_reason: string | null;
  cancel_reason: string | null;
  is_blocker: boolean;
  is_midflight: boolean;
  tpv_expected_date: string | null;
  bundle_label: string | null;
  bundle_type: BundleType | null;
}

export interface ScheduleBundle {
  project_id: string;
  project_name: string;
  stage_id: string | null;
  bundle_label: string | null;
  bundle_type: BundleType | null;
  split_part: number | null;
  split_total: number | null;
  items: ScheduleItem[];
  total_hours: number;
}

export interface WeekSilo {
  week_start: string;
  week_number: number;
  bundles: ScheduleBundle[];
  total_hours: number;
}

export function useProductionSchedule() {
  return useQuery({
    queryKey: ["production-schedule"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Fetch schedule items (only active statuses now)
      const { data, error } = await supabase
        .from("production_schedule")
        .select("*, projects!production_schedule_project_id_fkey(project_name)")
        .in("status", ["scheduled", "in_progress", "paused", "completed"])
        .order("position", { ascending: true });
      if (error) throw error;

      const itemCodes = Array.from(
        new Set((data || []).map((row) => normalizeProductionItemCode(row.item_code)).filter(Boolean))
      );
      const projectIds = Array.from(new Set((data || []).map((row) => row.project_id).filter(Boolean)));
      const { data: tpvRows } = itemCodes.length > 0 && projectIds.length > 0
        ? await supabase
            .from("tpv_items")
            .select("project_id, item_code, pocet")
            .in("project_id", projectIds)
            .in("item_code", itemCodes)
            .is("deleted_at", null)
        : { data: [] };

      const quantityByProjectAndCode = new Map<string, number | null>();
      for (const tpv of tpvRows || []) {
        quantityByProjectAndCode.set(`${tpv.project_id}::${tpv.item_code}`, tpv.pocet ?? null);
      }

      // Fetch completed schedule IDs from production_expedice
      const { data: expediceData } = await supabase
        .from("production_expedice" as any)
        .select("source_schedule_id, expediced_at");
      const expediceMap = new Map<string, string | null>();
      for (const row of expediceData || []) {
        const sid = (row as any).source_schedule_id;
        if (sid) expediceMap.set(sid, (row as any).expediced_at);
      }

      const splitMetaByGroup = new Map<string, { splitPart: number | null; splitTotal: number | null }>();
      for (const row of data || []) {
        const bundleType = resolveBundleType(row as any);
        const splitGroupId = (row as any).split_group_id ?? null;
        if (bundleType !== "split" || !splitGroupId) continue;
        const current = splitMetaByGroup.get(splitGroupId) ?? { splitPart: null, splitTotal: null };
        const splitPart = typeof (row as any).split_part === "number" ? (row as any).split_part : 0;
        const splitTotal = typeof (row as any).split_total === "number" ? (row as any).split_total : 0;
        splitMetaByGroup.set(splitGroupId, {
          splitPart: Math.max(current.splitPart ?? 0, splitPart) || null,
          splitTotal: Math.max(current.splitTotal ?? 0, splitTotal, splitPart) || null,
        });
      }

      const byWeek = new Map<string, Map<string, ScheduleBundle>>();

      for (const row of data || []) {
        // Apply virtual status from production_expedice
        let virtualStatus = row.status;
        let virtualCompletedAt = row.completed_at;
        let virtualExpedicedAt = (row as any).expediced_at ?? null;
        if (expediceMap.has(row.id)) {
          const expAt = expediceMap.get(row.id);
          virtualStatus = expAt ? "completed" : "expedice";
          virtualCompletedAt = virtualCompletedAt || new Date().toISOString();
          virtualExpedicedAt = expAt || null;
        }

        const week = row.scheduled_week;
        const pid = row.project_id;
        const bundleLabel = (row as any).bundle_label ?? fallbackBundleLabel((row as any).split_group_id ?? `${row.project_id}:${row.stage_id ?? "none"}:${row.scheduled_week}:${row.position}`);
        const bundleType = resolveBundleType(row as any);
        const splitGroupId = (row as any).split_group_id ?? null;
        const seriesMeta = splitGroupId ? splitMetaByGroup.get(splitGroupId) : null;
        const resolvedSplitPart = (row as any).split_part ?? (bundleType === "split" ? seriesMeta?.splitPart ?? null : null);
        const resolvedSplitTotal = (row as any).split_total ?? (bundleType === "split" ? seriesMeta?.splitTotal ?? null : null);
        const bundleKey = bundleType === "full"
          ? `${pid}::full::${bundleLabel}`
          : `${pid}::${row.stage_id ?? "none"}::${bundleLabel}::${resolvedSplitPart ?? "split"}`;
        if (!byWeek.has(week)) byWeek.set(week, new Map());
        const weekMap = byWeek.get(week)!;
        if (!weekMap.has(bundleKey)) {
          weekMap.set(bundleKey, {
            project_id: pid,
            project_name: (row as any).projects?.project_name || pid,
            stage_id: row.stage_id,
            bundle_label: bundleLabel,
            bundle_type: bundleType,
            split_part: resolvedSplitPart,
            split_total: resolvedSplitTotal,
            items: [],
            total_hours: 0,
          });
        }
        const bundle = weekMap.get(bundleKey)!;
        bundle.items.push({
          id: row.id,
          project_id: row.project_id,
          project_name: (row as any).projects?.project_name || pid,
          stage_id: row.stage_id,
          item_name: row.item_name,
          item_code: row.item_code ?? null,
          item_quantity: quantityByProjectAndCode.get(`${row.project_id}::${normalizeProductionItemCode(row.item_code)}`) ?? null,
          scheduled_week: row.scheduled_week,
          scheduled_hours: row.scheduled_hours,
          scheduled_czk: row.scheduled_czk,
          position: row.position,
          status: virtualStatus,
          completed_at: virtualCompletedAt,
          completed_by: row.completed_by,
          expediced_at: virtualExpedicedAt,
          split_group_id: splitGroupId,
          split_part: resolvedSplitPart,
          split_total: resolvedSplitTotal,
          pause_reason: (row as any).pause_reason ?? null,
          pause_expected_date: (row as any).pause_expected_date ?? null,
          adhoc_reason: (row as any).adhoc_reason ?? null,
          cancel_reason: (row as any).cancel_reason ?? null,
          is_blocker: (row as any).is_blocker ?? false,
          is_midflight: (row as any).is_midflight ?? false,
          tpv_expected_date: (row as any).tpv_expected_date ?? null,
          bundle_label: bundleLabel,
          bundle_type: bundleType,
        });
        const splitMeta = deriveBundleSplitMeta(bundle.items);
        bundle.bundle_type = splitMeta.isSplit ? "split" : bundle.bundle_type;
        bundle.split_part = splitMeta.splitPart;
        bundle.split_total = splitMeta.splitTotal;
        bundle.total_hours += row.scheduled_hours;
      }

      const result = new Map<string, WeekSilo>();
      for (const [week, weekMap] of byWeek) {
        const bundles = Array.from(weekMap.values());
        result.set(week, {
          week_start: week,
          week_number: getISOWeekNumber(new Date(week)),
          bundles,
          total_hours: bundles.reduce((s, b) => s + b.total_hours, 0),
        });
      }

      // Sanity audit: detect split-parts spread across multiple weeks (rovnaký split_group_id + split_part v 2+ týždňoch).
      // Tomu má zabraňovať DB trigger trg_sync_split_part_week — ak sa to objaví, signál na regresiu.
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        const partWeeks = new Map<string, Set<string>>();
        for (const [week, weekMap] of byWeek) {
          for (const bundle of weekMap.values()) {
            const sgid = bundle.items[0]?.split_group_id;
            const part = bundle.split_part;
            if (!sgid || part == null) continue;
            const key = `${sgid}::${part}`;
            if (!partWeeks.has(key)) partWeeks.set(key, new Set());
            partWeeks.get(key)!.add(week);
          }
        }
        for (const [key, weeks] of partWeeks) {
          if (weeks.size > 1) {
            console.warn(
              `[useProductionSchedule] split-part rozpadnutý cez týždne (${weeks.size}): ${key} → ${[...weeks].sort().join(", ")}`,
            );
          }
        }
      }

      return result;
    },
  });
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export { getISOWeekNumber };
