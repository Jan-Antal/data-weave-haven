/**
 * Príprava API.
 *
 * Two tables:
 *   - tpv_project_preparation (1:1 with projects)
 *   - tpv_preparation         (1:1 with tpv_items via UNIQUE constraint)
 *
 * The "view" data is composed by joining these with tpv_items, projects,
 * tpv_material, tpv_subcontract, tpv_hours_allocation to compute gates.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvPreparationRow,
  TpvProjectPreparationRow,
  PreparationItemView,
  ProjectPreparationView,
  PreparationFilters,
  UpdateProjectPreparationInput,
  UpsertItemPreparationInput,
  ReadinessStatus,
  CalcStatus,
} from "../types";

// ============================================================
// PROJECT-LEVEL — fetch all active projects with their preparation
// ============================================================

interface RawProject {
  project_id: string;
  project_name: string | null;
  pm: string | null;
  klient: string | null;
  status: string | null;
  is_active: boolean;
}

interface RawItem {
  id: string;
  project_id: string;
}

interface RawPreparationRow {
  project_id: string;
  tpv_item_id: string;
  doc_ok: boolean;
  hodiny_schvalene: boolean;
  readiness_status: ReadinessStatus;
}

interface RawProjectPreparationRow extends TpvProjectPreparationRow {}

interface RawMaterial {
  project_id: string;
  stav: string;
}

interface RawSubcontract {
  project_id: string;
  stav: string;
}

interface RawHoursAlloc {
  project_id: string;
  tpv_item_id: string;
  stav: string;
}

/**
 * Fetch projects with all rollup info needed for the Príprava list.
 * Heavy query — does 6 reads but no joins, then composes in-memory.
 */
export async function fetchProjectsWithPreparation(
  filters: PreparationFilters = {}
): Promise<ProjectPreparationView[]> {
  // 1) Active projects
  let projQuery = supabase
    .from("projects")
    .select("project_id, project_name, pm, klient, status, is_active");
  if (filters.active_only !== false) {
    projQuery = projQuery.eq("is_active", true);
  }
  const projRes = await projQuery;
  if (projRes.error) throw projRes.error;
  const projects = (projRes.data as RawProject[]) ?? [];
  if (projects.length === 0) return [];
  const projectIds = projects.map((p) => p.project_id);

  // 2) Project preparation rows
  const ppRes = await supabase
    .from("tpv_project_preparation")
    .select("*")
    .in("project_id", projectIds);
  if (ppRes.error) throw ppRes.error;
  const projectPreps = (ppRes.data as RawProjectPreparationRow[]) ?? [];
  const ppByProject = new Map<string, RawProjectPreparationRow>();
  for (const pp of projectPreps) ppByProject.set(pp.project_id, pp);

  // 3) tpv_items (for total + doc_ok counts and hodiny gating)
  const itemsRes = await supabase
    .from("tpv_items")
    .select("id, project_id")
    .in("project_id", projectIds)
    .is("deleted_at", null);
  if (itemsRes.error) throw itemsRes.error;
  const items = (itemsRes.data as RawItem[]) ?? [];

  // 4) Per-item preparation
  const prepRes = await supabase
    .from("tpv_preparation")
    .select(
      "project_id, tpv_item_id, doc_ok, hodiny_schvalene, readiness_status"
    )
    .in("project_id", projectIds);
  if (prepRes.error) throw prepRes.error;
  const preps = (prepRes.data as RawPreparationRow[]) ?? [];

  // 5) Materiál stav counts
  const matRes = await supabase
    .from("tpv_material")
    .select("project_id, stav")
    .in("project_id", projectIds);
  if (matRes.error) throw matRes.error;
  const materials = (matRes.data as RawMaterial[]) ?? [];

  // 6) Subdodávky stav counts
  const subRes = await supabase
    .from("tpv_subcontract")
    .select("project_id, stav")
    .in("project_id", projectIds);
  if (subRes.error) throw subRes.error;
  const subcontracts = (subRes.data as RawSubcontract[]) ?? [];

  // ----- compose -----
  const byProject = new Map<string, ProjectPreparationView>();
  for (const p of projects) {
    const pp = ppByProject.get(p.project_id);
    byProject.set(p.project_id, {
      id: pp?.id ?? `virtual:${p.project_id}`,
      project_id: p.project_id,
      calc_status: pp?.calc_status ?? ("draft" as CalcStatus),
      readiness_overall: pp?.readiness_overall ?? null,
      target_release_date: pp?.target_release_date ?? null,
      notes: pp?.notes ?? null,
      created_at: pp?.created_at ?? "",
      updated_at: pp?.updated_at ?? "",
      project: p,
      total_items: 0,
      rozpracovane: 0,
      ready: 0,
      riziko: 0,
      blokovane: 0,
      doc_ok_count: 0,
      hodiny_approved_count: 0,
      materials_delivered: 0,
      materials_total: 0,
      subcontracts_delivered: 0,
      subcontracts_total: 0,
      can_release: false,
    });
  }

  // total_items
  for (const it of items) {
    const r = byProject.get(it.project_id);
    if (r) r.total_items += 1;
  }

  // per-item preparation rollup
  for (const prep of preps) {
    const r = byProject.get(prep.project_id);
    if (!r) continue;
    r[prep.readiness_status] += 1;
    if (prep.doc_ok) r.doc_ok_count += 1;
    if (prep.hodiny_schvalene) r.hodiny_approved_count += 1;
  }

  // materials
  for (const m of materials) {
    const r = byProject.get(m.project_id);
    if (!r) continue;
    r.materials_total += 1;
    if (m.stav === "dodane") r.materials_delivered += 1;
  }

  // subcontracts
  for (const s of subcontracts) {
    const r = byProject.get(s.project_id);
    if (!r) continue;
    r.subcontracts_total += 1;
    if (s.stav === "delivered") r.subcontracts_delivered += 1;
  }

  // can_release: all items have doc_ok + hodiny approved + no blokovane;
  // all materials delivered; all subcontracts delivered
  for (const r of byProject.values()) {
    const itemsOk =
      r.total_items > 0 &&
      r.doc_ok_count === r.total_items &&
      r.hodiny_approved_count === r.total_items &&
      r.blokovane === 0;
    const matsOk =
      r.materials_total === 0 || r.materials_delivered === r.materials_total;
    const subsOk =
      r.subcontracts_total === 0 ||
      r.subcontracts_delivered === r.subcontracts_total;
    r.can_release = itemsOk && matsOk && subsOk;

    if (r.total_items > 0) {
      r.readiness_overall = r.ready / r.total_items;
    }
  }

  let out = Array.from(byProject.values());
  if (filters.calc_status) {
    out = out.filter((r) => r.calc_status === filters.calc_status);
  }
  if (filters.ready_only) {
    out = out.filter((r) => r.can_release);
  }
  out.sort((a, b) =>
    (a.project?.project_name ?? "").localeCompare(
      b.project?.project_name ?? "",
      "cs"
    )
  );
  return out;
}

// ============================================================
// PER-PROJECT DETAIL — items with preparation
// ============================================================

export async function fetchItemsForProject(
  projectId: string
): Promise<PreparationItemView[]> {
  const itemsRes = await supabase
    .from("tpv_items")
    .select("id, project_id, item_code, nazev, popis, status, hodiny_plan")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("item_code");
  if (itemsRes.error) throw itemsRes.error;
  const items =
    (itemsRes.data as Array<{
      id: string;
      project_id: string;
      item_code: string;
      nazev: string | null;
      popis: string | null;
      status: string | null;
      hodiny_plan: number | null;
    }>) ?? [];

  const prepRes = await supabase
    .from("tpv_preparation")
    .select("*")
    .eq("project_id", projectId);
  if (prepRes.error) throw prepRes.error;
  const preps = (prepRes.data as TpvPreparationRow[]) ?? [];
  const byItemId = new Map<string, TpvPreparationRow>();
  for (const p of preps) byItemId.set(p.tpv_item_id, p);

  return items.map((it) => {
    const prep = byItemId.get(it.id);
    if (prep) {
      return { ...prep, tpv_item: it };
    }
    return {
      id: `virtual:${it.id}`,
      tpv_item_id: it.id,
      project_id: projectId,
      doc_ok: false,
      hodiny_manual: null,
      hodiny_schvalene: false,
      readiness_status: "rozpracovane" as ReadinessStatus,
      notes: null,
      created_at: "",
      updated_at: "",
      tpv_item: it,
      isVirtual: true,
    };
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export async function updateProjectPreparation(
  input: UpdateProjectPreparationInput
): Promise<TpvProjectPreparationRow> {
  // Try to update existing
  const existingRes = await supabase
    .from("tpv_project_preparation")
    .select("*")
    .eq("project_id", input.project_id)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  const existing = existingRes.data as TpvProjectPreparationRow | null;

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (input.calc_status !== undefined) patch.calc_status = input.calc_status;
    if (input.target_release_date !== undefined)
      patch.target_release_date = input.target_release_date;
    if (input.notes !== undefined) patch.notes = input.notes;
    const { data, error } = await supabase
      .from("tpv_project_preparation")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TpvProjectPreparationRow;
  }

  const { data, error } = await supabase
    .from("tpv_project_preparation")
    .insert({
      project_id: input.project_id,
      calc_status: input.calc_status ?? "draft",
      target_release_date: input.target_release_date ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvProjectPreparationRow;
}

export async function upsertItemPreparation(
  input: UpsertItemPreparationInput
): Promise<TpvPreparationRow> {
  const existingRes = await supabase
    .from("tpv_preparation")
    .select("*")
    .eq("tpv_item_id", input.tpv_item_id)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  const existing = existingRes.data as TpvPreparationRow | null;

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (input.doc_ok !== undefined) patch.doc_ok = input.doc_ok;
    if (input.hodiny_manual !== undefined)
      patch.hodiny_manual = input.hodiny_manual;
    if (input.hodiny_schvalene !== undefined)
      patch.hodiny_schvalene = input.hodiny_schvalene;
    if (input.readiness_status !== undefined)
      patch.readiness_status = input.readiness_status;
    if (input.notes !== undefined) patch.notes = input.notes;
    const { data, error } = await supabase
      .from("tpv_preparation")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TpvPreparationRow;
  }

  const { data, error } = await supabase
    .from("tpv_preparation")
    .insert({
      tpv_item_id: input.tpv_item_id,
      project_id: input.project_id,
      doc_ok: input.doc_ok ?? false,
      hodiny_manual: input.hodiny_manual ?? null,
      hodiny_schvalene: input.hodiny_schvalene ?? false,
      readiness_status:
        input.readiness_status ?? ("rozpracovane" as ReadinessStatus),
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvPreparationRow;
}
