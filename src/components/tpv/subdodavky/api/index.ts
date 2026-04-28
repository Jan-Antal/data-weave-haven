/**
 * Subdodávky API layer — Supabase queries for tpv_subcontract* tables
 *
 * All queries are typed against types/index.ts. No magic strings.
 * Errors are propagated; calling hook handles toast/UI feedback.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvSubcontractRow,
  TpvSubcontractRequestRow,
  SubcontractView,
  SubcontractFilters,
  CreateSubcontractInput,
  UpdateSubcontractInput,
  CreateRFQRequestInput,
  UpdateRFQRequestInput,
} from "../types";
import { SUBCONTRACT_STAV, REQUEST_STAV } from "../types";
import type {
  TpvSupplierRow,
  TpvItemRef,
  ProjectRef,
} from "../../shared/types";

// ============================================================
// SUBCONTRACTS — read
// ============================================================

/**
 * Fetch subcontracts with full relations for UI.
 * Returns SubcontractView[] — caller may group/filter further.
 */
export async function fetchSubcontracts(
  filters: SubcontractFilters = {}
): Promise<SubcontractView[]> {
  let query = supabase
    .from("tpv_subcontract")
    .select(
      `
      *,
      supplier:tpv_supplier!tpv_subcontract_dodavatel_id_fkey(*),
      tpv_item:tpv_items!tpv_subcontract_tpv_item_id_fkey(
        id, project_id, item_code, nazev, popis, status, pocet, cena, konstrukter, stage_id
      ),
      project:projects!tpv_subcontract_project_id_fkey(
        project_id, project_name, pm, konstrukter, status, klient, expedice, predani, is_active
      ),
      requests:tpv_subcontract_request(
        *,
        supplier:tpv_supplier!tpv_subcontract_request_supplier_id_fkey(*)
      )
    `
    )
    .order("created_at", { ascending: false });

  if (filters.project_id) {
    query = query.eq("project_id", filters.project_id);
  }
  if (filters.dodavatel_id) {
    query = query.eq("dodavatel_id", filters.dodavatel_id);
  }
  if (filters.has_supplier === true) {
    query = query.not("dodavatel_id", "is", null);
  } else if (filters.has_supplier === false) {
    query = query.is("dodavatel_id", null);
  }
  if (filters.stav) {
    if (Array.isArray(filters.stav)) {
      query = query.in("stav", filters.stav);
    } else {
      query = query.eq("stav", filters.stav);
    }
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(`nazov.ilike.%${s}%,popis.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SubcontractView[];
}

/**
 * Single subcontract with relations.
 */
export async function fetchSubcontractById(
  id: string
): Promise<SubcontractView | null> {
  const { data, error } = await supabase
    .from("tpv_subcontract")
    .select(
      `
      *,
      supplier:tpv_supplier!tpv_subcontract_dodavatel_id_fkey(*),
      tpv_item:tpv_items!tpv_subcontract_tpv_item_id_fkey(
        id, project_id, item_code, nazev, popis, status, pocet, cena, konstrukter, stage_id
      ),
      project:projects!tpv_subcontract_project_id_fkey(
        project_id, project_name, pm, konstrukter, status, klient, expedice, predani, is_active
      ),
      requests:tpv_subcontract_request(
        *,
        supplier:tpv_supplier!tpv_subcontract_request_supplier_id_fkey(*)
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as SubcontractView | null;
}

// ============================================================
// SUBCONTRACTS — write
// ============================================================

/**
 * Create new subcontract.
 *
 * If `dodavatel_id` is provided → "rýchle zadanie", stav defaults to OBJEDNANE.
 * If `dodavatel_id` is NOT provided → expecting RFQ flow, stav defaults to NAVRH.
 */
export async function createSubcontract(
  input: CreateSubcontractInput
): Promise<TpvSubcontractRow> {
  const stav = input.dodavatel_id
    ? SUBCONTRACT_STAV.OBJEDNANE
    : SUBCONTRACT_STAV.NAVRH;

  const { data, error } = await supabase
    .from("tpv_subcontract")
    .insert({
      project_id: input.project_id,
      tpv_item_id: input.tpv_item_id ?? null,
      nazov: input.nazov,
      popis: input.popis ?? null,
      mnozstvo: input.mnozstvo ?? null,
      jednotka: input.jednotka ?? null,
      dodavatel_id: input.dodavatel_id ?? null,
      cena_predpokladana: input.cena_predpokladana ?? null,
      mena: input.mena,
      stav,
      poznamka: input.poznamka ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as TpvSubcontractRow;
}

export async function updateSubcontract(
  id: string,
  patch: UpdateSubcontractInput
): Promise<TpvSubcontractRow> {
  const { data, error } = await supabase
    .from("tpv_subcontract")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as TpvSubcontractRow;
}

export async function deleteSubcontract(id: string): Promise<void> {
  const { error } = await supabase.from("tpv_subcontract").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// RFQ REQUESTS — read / write
// ============================================================

/**
 * Bulk create RFQ requests for one subcontract.
 * Pre kazdeho dodavatela vznikne jeden zaznam so stav='pending'.
 */
export async function createRFQRequests(
  input: CreateRFQRequestInput
): Promise<TpvSubcontractRequestRow[]> {
  if (input.supplier_ids.length === 0) {
    throw new Error("Pre RFQ je potrebný aspoň jeden dodávateľ.");
  }

  const rows = input.supplier_ids.map((supplier_id) => ({
    subcontract_id: input.subcontract_id,
    supplier_id,
    stav: REQUEST_STAV.SENT,
    sent_at: new Date().toISOString(),
    poznamka: input.poznamka ?? null,
  }));

  const { data, error } = await supabase
    .from("tpv_subcontract_request")
    .insert(rows)
    .select("*");

  if (error) throw error;

  // Sub-contract goes to RFQ_PENDING when any RFQ exists
  await supabase
    .from("tpv_subcontract")
    .update({
      stav: SUBCONTRACT_STAV.RFQ,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.subcontract_id);

  return data as TpvSubcontractRequestRow[];
}

export async function updateRFQRequest(
  id: string,
  patch: UpdateRFQRequestInput
): Promise<TpvSubcontractRequestRow> {
  const { data, error } = await supabase
    .from("tpv_subcontract_request")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as TpvSubcontractRequestRow;
}

/**
 * Award RFQ winner.
 *
 * 1. Marks the chosen request as 'awarded'.
 * 2. Marks all other requests of the same subcontract as 'rejected'.
 * 3. Sets subcontract.dodavatel_id = winning supplier, stav='awarded',
 *    cena_finalna = winning offer (if present).
 *
 * NOTE: This is multi-step. Ideally a Postgres function (atomic).
 * For now we do it client-side; race conditions possible but accepted
 * given the low concurrency of this workflow.
 */
export async function awardRFQRequest(
  requestId: string
): Promise<TpvSubcontractRow> {
  // 1. Get the winning request + its subcontract id
  const { data: winner, error: errWinner } = await supabase
    .from("tpv_subcontract_request")
    .select("id, subcontract_id, supplier_id, cena_nabidka, mena")
    .eq("id", requestId)
    .single();

  if (errWinner) throw errWinner;
  if (!winner) throw new Error("RFQ request nebol nájdený.");

  // 2. Mark winner as awarded
  const { error: errAward } = await supabase
    .from("tpv_subcontract_request")
    .update({
      stav: REQUEST_STAV.ACCEPTED,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (errAward) throw errAward;

  // 3. Reject all other requests of same subcontract
  const { error: errReject } = await supabase
    .from("tpv_subcontract_request")
    .update({
      stav: REQUEST_STAV.REJECTED,
      updated_at: new Date().toISOString(),
    })
    .eq("subcontract_id", winner.subcontract_id)
    .neq("id", requestId);

  if (errReject) throw errReject;

  // 4. Update subcontract — naplň víťaza
  const subUpdate: Partial<TpvSubcontractRow> = {
    dodavatel_id: winner.supplier_id,
    stav: SUBCONTRACT_STAV.PONUKA,
    updated_at: new Date().toISOString(),
  };
  if (winner.cena_nabidka != null) {
    subUpdate.cena_finalna = winner.cena_nabidka;
  }

  const { data: subData, error: errSub } = await supabase
    .from("tpv_subcontract")
    .update(subUpdate)
    .eq("id", winner.subcontract_id)
    .select("*")
    .single();

  if (errSub) throw errSub;
  return subData as TpvSubcontractRow;
}

export async function deleteRFQRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_subcontract_request")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// SUPPLIERS — read (used by picker)
// ============================================================

/**
 * Lightweight supplier list for picker / dropdown.
 * Filters: only active suppliers, optionally by category.
 */
export async function fetchSuppliers(opts: {
  category?: string;
  search?: string;
  onlyActive?: boolean;
} = {}): Promise<TpvSupplierRow[]> {
  let query = supabase.from("tpv_supplier").select("*").order("nazov");

  if (opts.onlyActive !== false) {
    query = query.eq("is_active", true);
  }
  if (opts.category) {
    query = query.contains("kategorie", [opts.category]);
  }
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    query = query.or(`nazov.ilike.%${s}%,ico.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TpvSupplierRow[];
}

// ============================================================
// PROJECTS & TPV ITEMS — read (for dropdowns in forms)
// ============================================================

export async function fetchActiveProjects(): Promise<ProjectRef[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("project_id, project_name, pm, konstrukter, status, klient, expedice, predani, is_active")
    .order("project_id", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as ProjectRef[];
}

export async function fetchTpvItemsForProject(
  projectId: string
): Promise<TpvItemRef[]> {
  const { data, error } = await supabase
    .from("tpv_items")
    .select("id, project_id, item_code, nazev, popis, status, pocet, cena, konstrukter, stage_id")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("item_code");

  if (error) throw error;
  return (data ?? []) as TpvItemRef[];
}
