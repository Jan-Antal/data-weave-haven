/**
 * Materiál API — Supabase queries for tpv_material.
 *
 * Embedded joins použité s explicit FK names:
 *   - tpv_item: tpv_items via tpv_material_tpv_item_id_fkey
 *   - project:  projects   via tpv_material_project_id_fkey
 *
 * Ak constraint v DB chýba pod presne týmto názvom, treba migráciu
 * (analogicky k subdodávkam — tpv_material_project_id_fkey možno
 * netreba, ak Supabase nájde reláciu sám — preto fallback bez !FK).
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvMaterialRow,
  MaterialView,
  MaterialFilters,
  CreateMaterialInput,
  UpdateMaterialInput,
  MaterialStav,
  MaterialProjectSummary,
} from "../types";
import { MATERIAL_STAV } from "../types";

// ============================================================
// READ
// ============================================================

const SELECT_FULL = `
  *,
  tpv_item:tpv_items(
    id, project_id, item_code, nazev, popis, status
  ),
  project:projects(
    project_id, project_name, pm, klient, status, is_active
  )
` as const;

/** Fetch materials with tpv_item + project relations. */
export async function fetchMaterials(
  filters: MaterialFilters = {}
): Promise<MaterialView[]> {
  let query = supabase
    .from("tpv_material")
    .select(SELECT_FULL)
    .order("created_at", { ascending: false });

  if (filters.project_id) {
    query = query.eq("project_id", filters.project_id);
  }
  if (filters.tpv_item_id) {
    query = query.eq("tpv_item_id", filters.tpv_item_id);
  }
  if (filters.stav) {
    if (Array.isArray(filters.stav)) {
      query = query.in("stav", filters.stav);
    } else {
      query = query.eq("stav", filters.stav);
    }
  }
  if (filters.has_dodavatel === true) {
    query = query.not("dodavatel", "is", null);
  } else if (filters.has_dodavatel === false) {
    query = query.is("dodavatel", null);
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `nazov.ilike.%${s}%,dodavatel.ilike.%${s}%,poznamka.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  let rows = (data as MaterialView[]) ?? [];

  // Client-side filters (Supabase can't express these cleanly):
  if (filters.active_only !== false) {
    rows = rows.filter((r) => r.project?.is_active !== false);
  }
  if (filters.overdue_only) {
    const now = Date.now();
    const FOURTEEN_D = 14 * 24 * 60 * 60 * 1000;
    rows = rows.filter((r) => {
      if (!r.objednane_dat || r.dodane_dat) return false;
      if (r.stav === "dodane") return false;
      return now - new Date(r.objednane_dat).getTime() > FOURTEEN_D;
    });
  }

  return rows;
}

export async function fetchMaterialById(id: string): Promise<MaterialView | null> {
  const { data, error } = await supabase
    .from("tpv_material")
    .select(SELECT_FULL)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as MaterialView | null) ?? null;
}

// ============================================================
// CREATE / UPDATE / DELETE
// ============================================================

export async function createMaterial(
  input: CreateMaterialInput
): Promise<TpvMaterialRow> {
  const payload = {
    tpv_item_id: input.tpv_item_id,
    project_id: input.project_id,
    nazov: input.nazov,
    mnozstvo: input.mnozstvo ?? null,
    jednotka: input.jednotka ?? null,
    dodavatel: input.dodavatel?.trim() || null,
    poznamka: input.poznamka?.trim() || null,
    stav: (input.stav ?? "nezadany") as MaterialStav,
  };
  const { data, error } = await supabase
    .from("tpv_material")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialRow;
}

export async function updateMaterial(
  input: UpdateMaterialInput
): Promise<TpvMaterialRow> {
  const { id, ...rest } = input;
  // Auto-set objednane_dat when stav transitions to objednane and missing.
  // Auto-set dodane_dat when stav becomes dodane and missing.
  const patch: Record<string, unknown> = { ...rest };
  if (rest.stav === "objednane" && rest.objednane_dat === undefined) {
    patch.objednane_dat = new Date().toISOString().slice(0, 10);
  }
  if (rest.stav === "dodane" && rest.dodane_dat === undefined) {
    patch.dodane_dat = new Date().toISOString().slice(0, 10);
  }
  const { data, error } = await supabase
    .from("tpv_material")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialRow;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from("tpv_material").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// BULK
// ============================================================

/** Bulk insert from Excel import. Returns inserted rows. */
export async function bulkInsertMaterials(
  rows: CreateMaterialInput[]
): Promise<TpvMaterialRow[]> {
  if (rows.length === 0) return [];
  const payload = rows.map((r) => ({
    tpv_item_id: r.tpv_item_id,
    project_id: r.project_id,
    nazov: r.nazov,
    mnozstvo: r.mnozstvo ?? null,
    jednotka: r.jednotka ?? null,
    dodavatel: r.dodavatel?.trim() || null,
    poznamka: r.poznamka?.trim() || null,
    stav: (r.stav ?? "nezadany") as MaterialStav,
  }));
  const { data, error } = await supabase
    .from("tpv_material")
    .insert(payload)
    .select("*");
  if (error) throw error;
  return (data as TpvMaterialRow[]) ?? [];
}

/** Bulk status update. */
export async function bulkUpdateStatus(
  ids: string[],
  stav: MaterialStav
): Promise<void> {
  if (ids.length === 0) return;
  const patch: Record<string, unknown> = { stav };
  if (stav === "objednane") {
    patch.objednane_dat = new Date().toISOString().slice(0, 10);
  } else if (stav === "dodane") {
    patch.dodane_dat = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase
    .from("tpv_material")
    .update(patch)
    .in("id", ids);
  if (error) throw error;
}

// ============================================================
// AGGREGATES
// ============================================================

/** Compute per-project summary from a fetched MaterialView[]. */
export function computeProjectSummaries(
  views: MaterialView[]
): MaterialProjectSummary[] {
  const map = new Map<string, MaterialProjectSummary>();
  const now = Date.now();
  const FOURTEEN_D = 14 * 24 * 60 * 60 * 1000;

  for (const v of views) {
    let s = map.get(v.project_id);
    if (!s) {
      s = {
        project_id: v.project_id,
        project_name: v.project?.project_name ?? null,
        total: 0,
        nezadany: 0,
        objednane: 0,
        caka: 0,
        dodane: 0,
        overdue: 0,
      };
      map.set(v.project_id, s);
    }
    s.total += 1;
    s[v.stav] += 1;
    if (
      v.objednane_dat &&
      !v.dodane_dat &&
      v.stav !== "dodane" &&
      now - new Date(v.objednane_dat).getTime() > FOURTEEN_D
    ) {
      s.overdue += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.project_name ?? "").localeCompare(b.project_name ?? "", "cs")
  );
}

/** Group materials by project_id — for Per-projekt view. */
export function groupByProject(
  views: MaterialView[]
): Map<string, MaterialView[]> {
  const map = new Map<string, MaterialView[]>();
  for (const v of views) {
    const arr = map.get(v.project_id) ?? [];
    arr.push(v);
    map.set(v.project_id, arr);
  }
  return map;
}

/** Group materials by material name (case-insensitive) — Per-materiál view. */
export function groupByMaterialName(
  views: MaterialView[]
): Map<string, MaterialView[]> {
  const map = new Map<string, MaterialView[]>();
  for (const v of views) {
    const key = v.nazov.trim().toLowerCase();
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
  return map;
}

// Re-export constants for convenience
export { MATERIAL_STAV };
