import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "./useProjects";
import { useAllTPVItems } from "./useAllTPVItems";
import { useTpvPreparationAll } from "./useTpvPreparation";
import { useTpvMaterialAll } from "./useTpvMaterial";
import { computeReadiness, type ReadinessStatus } from "@/lib/tpvReadiness";
import { resolveDeadline } from "@/lib/deadlineWarning";
import type { Project } from "./useProjects";
import type { TPVItem } from "./useTPVItems";
import type { TpvPreparation } from "./useTpvPreparation";
import type { TpvMaterial } from "./useTpvMaterial";

const PIPELINE_STATUSES = new Set(["Příprava", "Konstrukce", "TPV"]);

export interface TpvProjectRow {
  project: Project;
  items: TPVItem[];
  prepByItemId: Map<string, TpvPreparation>;
  materialsByItemId: Map<string, TpvMaterial[]>;
  readinessByItemId: Map<string, ReadinessStatus>;
  /** Worst-of (blokovane > riziko > rozpracovane > ready) for whole project */
  projectReadiness: ReadinessStatus;
  itemCount: number;
  docOkCount: number;
  totalAutoHours: number;
  totalEffectiveHours: number;
  deadline: ReturnType<typeof resolveDeadline>;
  daysToDeadline: number | null;
}

const RANK: Record<ReadinessStatus, number> = {
  ready: 0,
  rozpracovane: 1,
  riziko: 2,
  blokovane: 3,
};

export function useTpvPipelineProjects() {
  const { data: projects = [], isLoading: pl } = useProjects();
  const { data: tpvItems = [], itemsByProject, isLoading: il } = useAllTPVItems();
  const { data: preps = [], isLoading: ppl } = useTpvPreparationAll();
  const { data: materials = [], isLoading: ml } = useTpvMaterialAll();
  const { data: links = [], isLoading: lll } = useQuery({
    queryKey: ["tpv_material_item_link_all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_material_item_link")
        .select("material_id, tpv_item_id");
      if (error) throw error;
      return (data ?? []) as { material_id: string; tpv_item_id: string }[];
    },
  });

  const isLoading = pl || il || ppl || ml || lll;

  const rows = useMemo<TpvProjectRow[]>(() => {
    if (!projects.length) return [];

    const prepByItem = new Map<string, TpvPreparation>();
    for (const p of preps) prepByItem.set(p.tpv_item_id, p);

    // Build per-item materials map via link table.
    const materialById = new Map<string, TpvMaterial>();
    for (const m of materials) materialById.set(m.id, m);
    const matsByItem = new Map<string, TpvMaterial[]>();
    for (const link of links) {
      const mat = materialById.get(link.material_id);
      if (!mat) continue;
      const arr = matsByItem.get(link.tpv_item_id);
      if (arr) arr.push(mat);
      else matsByItem.set(link.tpv_item_id, [mat]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: TpvProjectRow[] = [];
    for (const project of projects) {
      const status = (project as any).status as string | null;
      if (!status || !PIPELINE_STATUSES.has(status)) continue;
      const items = itemsByProject.get(project.project_id) ?? [];
      if (items.length === 0) continue;

      const readinessByItemId = new Map<string, ReadinessStatus>();
      let docOkCount = 0;
      let totalAutoHours = 0;
      let totalEffectiveHours = 0;
      let worst: ReadinessStatus = "ready";

      for (const it of items) {
        const prep = prepByItem.get(it.id);
        const mats = matsByItem.get(it.id) ?? [];
        const r = computeReadiness(prep, mats);
        readinessByItemId.set(it.id, r);
        if (RANK[r] > RANK[worst]) worst = r;
        if (prep?.doc_ok) docOkCount += 1;
        const auto = Number((it as any).hodiny_plan ?? 0) || 0;
        const manual = prep?.hodiny_manual != null ? Number(prep.hodiny_manual) : null;
        totalAutoHours += auto;
        totalEffectiveHours += manual != null ? manual : auto;
      }

      const deadline = resolveDeadline(project as any);
      let daysToDeadline: number | null = null;
      if (deadline) {
        const d = new Date(deadline.date);
        d.setHours(0, 0, 0, 0);
        daysToDeadline = Math.round((d.getTime() - today.getTime()) / 86400000);
      }

      result.push({
        project,
        items,
        prepByItemId: new Map(items.map((i) => [i.id, prepByItem.get(i.id)!]).filter(([, v]) => v) as [string, TpvPreparation][]),
        materialsByItemId: new Map(items.map((i) => [i.id, matsByItem.get(i.id) ?? []])),
        readinessByItemId,
        projectReadiness: worst,
        itemCount: items.length,
        docOkCount,
        totalAutoHours,
        totalEffectiveHours,
        deadline,
        daysToDeadline,
      });
    }

    // Sort by urgency: smaller daysToDeadline first; nulls last
    result.sort((a, b) => {
      if (a.daysToDeadline == null && b.daysToDeadline == null) return 0;
      if (a.daysToDeadline == null) return 1;
      if (b.daysToDeadline == null) return -1;
      return a.daysToDeadline - b.daysToDeadline;
    });

    return result;
  }, [projects, tpvItems, itemsByProject, preps, materials, links]);

  return { rows, isLoading };
}
