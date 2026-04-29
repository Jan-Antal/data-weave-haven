/**
 * Hodiny API — Supabase queries for tpv_hours_allocation.
 *
 * Workflow operations (submit/approve/return) musia nastaviť
 * submitted_by/approved_by + timestamps konzistentne.
 *
 * Joining strategy: tpv_hours_allocation has FK to tpv_items but
 * NOT to projects. So we use:
 *   - tpv_item: tpv_items(...) embedded (FK exists)
 *   - projects fetched separately and woven in JS
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvHoursAllocationRow,
  HoursAllocationView,
  HoursFilters,
  HoursStav,
  HoursProjectRollup,
  UpsertAllocationInput,
  SubmitAllocationInput,
  ApproveAllocationInput,
  ReturnAllocationInput,
} from "../types";

// ============================================================
// HELPERS
// ============================================================

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ============================================================
// READ
// ============================================================

export async function fetchAllocations(
  filters: HoursFilters = {}
): Promise<HoursAllocationView[]> {
  // We avoid embedded join on projects because tpv_hours_allocation
  // has no FK to projects in DB. Instead: fetch allocations + tpv_items
  // (FK exists), then fetch projects in one batched query, then weave.
  let query = supabase
    .from("tpv_hours_allocation")
    .select(
      `
      *,
      tpv_item:tpv_items(
        id, project_id, item_code, nazev, popis, status, hodiny_plan, hodiny_source
      )
    `
    )
    .order("updated_at", { ascending: false });

  if (filters.project_id) {
    query = query.eq("project_id", filters.project_id);
  }
  if (filters.stav) {
    if (Array.isArray(filters.stav)) {
      query = query.in("stav", filters.stav);
    } else {
      query = query.eq("stav", filters.stav);
    }
  }
  if (filters.mine_only) {
    const userId = await getCurrentUserId();
    if (userId) query = query.eq("submitted_by", userId);
    else return [];
  }
  if (filters.pending_my_review) {
    query = query.eq("stav", "submitted");
  }

  const { data, error } = await query;
  if (error) throw error;

  type AllocWithItem = Omit<HoursAllocationView, "project">;
  const baseRows = (data as AllocWithItem[]) ?? [];

  if (baseRows.length === 0) return [];

  // Batch-fetch projects for all distinct project_ids
  const projectIds = Array.from(
    new Set(baseRows.map((r) => r.project_id))
  );
  const projRes = await supabase
    .from("projects")
    .select("project_id, project_name, pm, klient, status, is_active")
    .in("project_id", projectIds);
  if (projRes.error) throw projRes.error;
  const byProjectId = new Map<string, HoursAllocationView["project"]>();
  for (const p of (projRes.data as Array<{
    project_id: string;
    project_name: string | null;
    pm: string | null;
    klient: string | null;
    status: string | null;
    is_active: boolean;
  }>) ?? []) {
    byProjectId.set(p.project_id, p);
  }

  let rows: HoursAllocationView[] = baseRows.map((r) => ({
    ...r,
    project: byProjectId.get(r.project_id) ?? null,
  }));

  if (filters.active_only !== false) {
    rows = rows.filter((r) => r.project?.is_active !== false);
  }
  return rows;
}

/**
 * Fetch ALL tpv_items for a project + their existing allocations.
 * Returns one HoursAllocationView per item — virtualizes a row when
 * no allocation exists. Canonical "kalkulant view".
 */
export async function fetchProjectItemsWithAllocations(
  projectId: string
): Promise<HoursAllocationView[]> {
  const itemsRes = await supabase
    .from("tpv_items")
    .select(
      "id, project_id, item_code, nazev, popis, status, hodiny_plan, hodiny_source"
    )
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
      hodiny_source: string | null;
    }>) ?? [];

  const allocRes = await supabase
    .from("tpv_hours_allocation")
    .select("*")
    .eq("project_id", projectId);
  if (allocRes.error) throw allocRes.error;
  const allocs = (allocRes.data as TpvHoursAllocationRow[]) ?? [];
  const byItemId = new Map<string, TpvHoursAllocationRow>();
  for (const a of allocs) byItemId.set(a.tpv_item_id, a);

  const projRes = await supabase
    .from("projects")
    .select("project_id, project_name, pm, klient, status, is_active")
    .eq("project_id", projectId)
    .maybeSingle();
  const project = projRes.data
    ? (projRes.data as HoursAllocationView["project"])
    : null;

  return items.map((it) => {
    const alloc = byItemId.get(it.id);
    if (alloc) {
      return { ...alloc, tpv_item: it, project };
    }
    return {
      id: `virtual:${it.id}`,
      project_id: projectId,
      tpv_item_id: it.id,
      hodiny_navrh: null,
      stav: "draft" as HoursStav,
      submitted_by: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
      return_reason: null,
      notes: null,
      created_at: "",
      updated_at: "",
      tpv_item: it,
      project,
      isVirtual: true,
    };
  });
}

// ============================================================
// PROJECT ROLLUP — for Projekty list (top-level Hodiny view)
// ============================================================

export async function fetchProjectRollups(): Promise<HoursProjectRollup[]> {
  const projRes = await supabase
    .from("projects")
    .select("project_id, project_name, pm, klient, is_active")
    .eq("is_active", true);
  if (projRes.error) throw projRes.error;
  const projects =
    (projRes.data as Array<{
      project_id: string;
      project_name: string | null;
      pm: string | null;
      klient: string | null;
      is_active: boolean;
    }>) ?? [];

  const projectIds = projects.map((p) => p.project_id);
  if (projectIds.length === 0) return [];

  const itemsRes = await supabase
    .from("tpv_items")
    .select("id, project_id, hodiny_plan")
    .in("project_id", projectIds)
    .is("deleted_at", null);
  if (itemsRes.error) throw itemsRes.error;
  const items =
    (itemsRes.data as Array<{
      id: string;
      project_id: string;
      hodiny_plan: number | null;
    }>) ?? [];

  const allocRes = await supabase
    .from("tpv_hours_allocation")
    .select("project_id, tpv_item_id, hodiny_navrh, stav")
    .in("project_id", projectIds);
  if (allocRes.error) throw allocRes.error;
  const allocs =
    (allocRes.data as Array<{
      project_id: string;
      tpv_item_id: string;
      hodiny_navrh: number | null;
      stav: HoursStav;
    }>) ?? [];

  const byProject = new Map<string, HoursProjectRollup>();
  for (const p of projects) {
    byProject.set(p.project_id, {
      project_id: p.project_id,
      project_name: p.project_name,
      pm: p.pm,
      klient: p.klient,
      total_items: 0,
      draft: 0,
      submitted: 0,
      approved: 0,
      returned: 0,
      missing: 0,
      sum_plan: 0,
      sum_navrh: 0,
      sum_approved: 0,
    });
  }
  const itemIdsByProject = new Map<string, Set<string>>();
  for (const it of items) {
    const r = byProject.get(it.project_id);
    if (!r) continue;
    r.total_items += 1;
    r.sum_plan += it.hodiny_plan ?? 0;
    let s = itemIdsByProject.get(it.project_id);
    if (!s) {
      s = new Set();
      itemIdsByProject.set(it.project_id, s);
    }
    s.add(it.id);
  }
  const seenItemIdsPerProject = new Map<string, Set<string>>();
  for (const a of allocs) {
    const r = byProject.get(a.project_id);
    if (!r) continue;
    r[a.stav] += 1;
    r.sum_navrh += a.hodiny_navrh ?? 0;
    if (a.stav === "approved") r.sum_approved += a.hodiny_navrh ?? 0;
    let seen = seenItemIdsPerProject.get(a.project_id);
    if (!seen) {
      seen = new Set();
      seenItemIdsPerProject.set(a.project_id, seen);
    }
    seen.add(a.tpv_item_id);
  }
  for (const [pid, r] of byProject.entries()) {
    const all = itemIdsByProject.get(pid)?.size ?? 0;
    const seen = seenItemIdsPerProject.get(pid)?.size ?? 0;
    r.missing = Math.max(0, all - seen);
  }

  return Array.from(byProject.values())
    .filter((r) => r.total_items > 0)
    .sort((a, b) =>
      (a.project_name ?? "").localeCompare(b.project_name ?? "", "cs")
    );
}

// ============================================================
// UPSERT — kalkulant edits (stays as draft until submit)
// ============================================================

/**
 * Insert or update an allocation. Used by kalkulant typing into
 * the návrh field. Default stav = draft if creating fresh.
 *
 * If row already exists we patch only mutable fields; we never
 * change submitted_by/approved_by here.
 */
export async function upsertAllocation(
  input: UpsertAllocationInput
): Promise<TpvHoursAllocationRow> {
  // Try fetch existing
  const existingRes = await supabase
    .from("tpv_hours_allocation")
    .select("*")
    .eq("project_id", input.project_id)
    .eq("tpv_item_id", input.tpv_item_id)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  const existing = existingRes.data as TpvHoursAllocationRow | null;

  if (existing) {
    const patch: Record<string, unknown> = {
      hodiny_navrh: input.hodiny_navrh,
    };
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.stav !== undefined) patch.stav = input.stav;

    const { data, error } = await supabase
      .from("tpv_hours_allocation")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TpvHoursAllocationRow;
  }

  const payload = {
    project_id: input.project_id,
    tpv_item_id: input.tpv_item_id,
    hodiny_navrh: input.hodiny_navrh,
    stav: (input.stav ?? "draft") as HoursStav,
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase
    .from("tpv_hours_allocation")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvHoursAllocationRow;
}

// ============================================================
// WORKFLOW — submit / approve / return
// ============================================================

/**
 * Kalkulant: submit allocation for PM review.
 * Sets stav=submitted, submitted_by=current user, submitted_at=now.
 * Clears any previous return_reason (fresh attempt).
 */
export async function submitAllocation(
  input: SubmitAllocationInput
): Promise<TpvHoursAllocationRow> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Nie si prihlásený.");

  const patch: Record<string, unknown> = {
    stav: "submitted" as HoursStav,
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
    return_reason: null,
  };
  if (input.hodiny_navrh !== undefined)
    patch.hodiny_navrh = input.hodiny_navrh;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("tpv_hours_allocation")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvHoursAllocationRow;
}

/**
 * PM: approve a submitted allocation.
 * Sets stav=approved, approved_by=current user, approved_at=now.
 */
export async function approveAllocation(
  input: ApproveAllocationInput
): Promise<TpvHoursAllocationRow> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Nie si prihlásený.");

  const { data, error } = await supabase
    .from("tpv_hours_allocation")
    .update({
      stav: "approved" as HoursStav,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvHoursAllocationRow;
}

/**
 * PM: return an allocation back to kalkulant with a reason.
 * Sets stav=returned, return_reason. Clears approved_*.
 */
export async function returnAllocation(
  input: ReturnAllocationInput
): Promise<TpvHoursAllocationRow> {
  if (!input.return_reason.trim()) {
    throw new Error("Dôvod vrátenia je povinný.");
  }
  const { data, error } = await supabase
    .from("tpv_hours_allocation")
    .update({
      stav: "returned" as HoursStav,
      return_reason: input.return_reason.trim(),
      approved_by: null,
      approved_at: null,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvHoursAllocationRow;
}

// ============================================================
// BULK
// ============================================================

/** Bulk submit — kalkulant odošle viacero naraz. */
export async function bulkSubmit(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Nie si prihlásený.");

  const { error } = await supabase
    .from("tpv_hours_allocation")
    .update({
      stav: "submitted" as HoursStav,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      return_reason: null,
    })
    .in("id", ids);
  if (error) throw error;
}

/** Bulk approve — PM schváli viacero naraz. */
export async function bulkApprove(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Nie si prihlásený.");

  const { error } = await supabase
    .from("tpv_hours_allocation")
    .update({
      stav: "approved" as HoursStav,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
}
