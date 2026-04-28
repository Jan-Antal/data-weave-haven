/**
 * Supplier CRM API — contacts, pricelist, tasks, computed stats.
 *
 * Writes go to RLS-protected tables. Stats are computed client-side
 * from existing tpv_subcontract data (no separate aggregation table).
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvSupplierContactRow,
  TpvSupplierPricelistRow,
  TpvSupplierTaskRow,
  CreateSupplierContactInput,
  UpdateSupplierContactInput,
  CreateSupplierPricelistInput,
  UpdateSupplierPricelistInput,
  CreateSupplierTaskInput,
  UpdateSupplierTaskInput,
  SupplierCrmStats,
} from "./types";
import type { TpvSupplierRow } from "../shared/types";
import type { TpvSubcontractRow } from "../subdodavky/types";
import { SUBCONTRACT_STAV } from "../subdodavky/types";

// ============================================================
// SUPPLIER — single fetch with full record (CRM modal needs it)
// ============================================================

export async function fetchSupplierById(
  id: string
): Promise<TpvSupplierRow | null> {
  const { data, error } = await supabase
    .from("tpv_supplier")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TpvSupplierRow | null;
}

export async function updateSupplier(
  id: string,
  patch: Partial<
    Pick<
      TpvSupplierRow,
      | "nazov"
      | "ico"
      | "dic"
      | "kontakt_meno"
      | "kontakt_email"
      | "kontakt_telefon"
      | "kontakt_pozice"
      | "web"
      | "adresa"
      | "kategorie"
      | "rating"
      | "notes"
      | "is_active"
    >
  >
): Promise<TpvSupplierRow> {
  const { data, error } = await supabase
    .from("tpv_supplier")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierRow;
}

// ============================================================
// CONTACTS
// ============================================================

export async function fetchSupplierContacts(
  supplierId: string
): Promise<TpvSupplierContactRow[]> {
  const { data, error } = await supabase
    .from("tpv_supplier_contact")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("meno");
  if (error) throw error;
  return (data ?? []) as TpvSupplierContactRow[];
}

export async function createSupplierContact(
  input: CreateSupplierContactInput
): Promise<TpvSupplierContactRow> {
  // If marking as primary, unset existing primary first (DB has unique
  // partial index that would otherwise conflict).
  if (input.is_primary) {
    await supabase
      .from("tpv_supplier_contact")
      .update({ is_primary: false })
      .eq("supplier_id", input.supplier_id)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("tpv_supplier_contact")
    .insert({
      supplier_id: input.supplier_id,
      meno: input.meno,
      pozice: input.pozice ?? null,
      email: input.email ?? null,
      telefon: input.telefon ?? null,
      is_primary: input.is_primary ?? false,
      poznamka: input.poznamka ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierContactRow;
}

export async function updateSupplierContact(
  id: string,
  patch: UpdateSupplierContactInput
): Promise<TpvSupplierContactRow> {
  // If toggling primary on, clear other primaries on same supplier first.
  if (patch.is_primary === true) {
    const { data: current } = await supabase
      .from("tpv_supplier_contact")
      .select("supplier_id")
      .eq("id", id)
      .single();
    if (current?.supplier_id) {
      await supabase
        .from("tpv_supplier_contact")
        .update({ is_primary: false })
        .eq("supplier_id", current.supplier_id)
        .eq("is_primary", true)
        .neq("id", id);
    }
  }

  const { data, error } = await supabase
    .from("tpv_supplier_contact")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierContactRow;
}

export async function deleteSupplierContact(id: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_supplier_contact")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// PRICELIST
// ============================================================

export async function fetchSupplierPricelist(
  supplierId: string,
  opts: { onlyActive?: boolean } = {}
): Promise<TpvSupplierPricelistRow[]> {
  let query = supabase
    .from("tpv_supplier_pricelist")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("kategoria", { ascending: true, nullsFirst: false })
    .order("polozka");

  if (opts.onlyActive !== false) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TpvSupplierPricelistRow[];
}

export async function createPricelistItem(
  input: CreateSupplierPricelistInput
): Promise<TpvSupplierPricelistRow> {
  const { data, error } = await supabase
    .from("tpv_supplier_pricelist")
    .insert({
      supplier_id: input.supplier_id,
      kategoria: input.kategoria ?? null,
      polozka: input.polozka,
      cena: input.cena,
      mena: input.mena ?? "CZK",
      jednotka: input.jednotka ?? "ks",
      leadtime_dni: input.leadtime_dni ?? null,
      min_objednavka: input.min_objednavka ?? null,
      poznamka: input.poznamka ?? null,
      platne_od: input.platne_od ?? null,
      platne_do: input.platne_do ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierPricelistRow;
}

export async function updatePricelistItem(
  id: string,
  patch: UpdateSupplierPricelistInput
): Promise<TpvSupplierPricelistRow> {
  const { data, error } = await supabase
    .from("tpv_supplier_pricelist")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierPricelistRow;
}

export async function deletePricelistItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_supplier_pricelist")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// TASKS
// ============================================================

export async function fetchSupplierTasks(
  supplierId: string,
  opts: { onlyOpen?: boolean } = {}
): Promise<TpvSupplierTaskRow[]> {
  let query = supabase
    .from("tpv_supplier_task")
    .select("*")
    .eq("supplier_id", supplierId)
    // open/in_progress first, done/cancelled last; secondary by due_date asc
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false });

  if (opts.onlyOpen) {
    query = query.in("status", ["open", "in_progress"]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TpvSupplierTaskRow[];
}

export async function createSupplierTask(
  input: CreateSupplierTaskInput
): Promise<TpvSupplierTaskRow> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("tpv_supplier_task")
    .insert({
      supplier_id: input.supplier_id,
      subcontract_id: input.subcontract_id ?? null,
      project_id: input.project_id ?? null,
      title: input.title,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      assigned_to: input.assigned_to ?? null,
      priority: input.priority ?? "normal",
      created_by: user?.id ?? null,
      // status defaults to 'open' via DB default
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierTaskRow;
}

export async function updateSupplierTask(
  id: string,
  patch: UpdateSupplierTaskInput
): Promise<TpvSupplierTaskRow> {
  const { data: { user } } = await supabase.auth.getUser();

  // If transitioning into 'done', stamp done_at + done_by.
  // If transitioning to any non-done status, clear them.
  const finalPatch: Record<string, unknown> = { ...patch };
  if (patch.status === "done") {
    finalPatch.done_at = new Date().toISOString();
    finalPatch.done_by = user?.id ?? null;
  } else if (patch.status) {
    finalPatch.done_at = null;
    finalPatch.done_by = null;
  }

  const { data, error } = await supabase
    .from("tpv_supplier_task")
    .update(finalPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvSupplierTaskRow;
}

export async function deleteSupplierTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_supplier_task")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// COMPUTED STATS
// ============================================================

/**
 * Fetch all subcontracts for a supplier (used to compute CRM stats and to
 * display "Zákazky" tab in the modal).
 */
export async function fetchSupplierSubcontracts(
  supplierId: string
): Promise<TpvSubcontractRow[]> {
  const { data, error } = await supabase
    .from("tpv_subcontract")
    .select("*")
    .eq("dodavatel_id", supplierId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TpvSubcontractRow[];
}

/**
 * Compute aggregated CRM stats from raw subcontract list.
 * Pure function — easy to test.
 */
export function computeSupplierStats(
  subcontracts: TpvSubcontractRow[]
): SupplierCrmStats {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let active = 0;
  let activeValue = 0;
  let delivered = 0;
  let totalYtd = 0;
  let onTimeYes = 0;
  let onTimeTotal = 0;
  let leadtimeSum = 0;
  let leadtimeCount = 0;
  let earliest: Date | null = null;

  for (const s of subcontracts) {
    const cena = Number(s.cena_finalna ?? s.cena_predpokladana ?? 0);
    const created = new Date(s.created_at);

    if (!earliest || created < earliest) earliest = created;

    if (
      s.stav !== SUBCONTRACT_STAV.DODANE &&
      s.stav !== SUBCONTRACT_STAV.ZRUSENO
    ) {
      active++;
      activeValue += cena;
    }

    if (s.stav === SUBCONTRACT_STAV.DODANE) {
      delivered++;
      // on-time: dodane_dat (actual) <= planned date.
      // We don't have a separate "planned" column distinct from dodane_dat,
      // so we approximate: if delivered AND objednane_dat exists,
      // we consider on-time relative to a typical leadtime —
      // for now, count all delivered as "on time" if objednane_dat <= dodane_dat.
      // (Placeholder until we add planovany_navrat column.)
      if (s.objednane_dat && s.dodane_dat) {
        const obj = new Date(s.objednane_dat).getTime();
        const dod = new Date(s.dodane_dat).getTime();
        const days = (dod - obj) / (1000 * 60 * 60 * 24);
        leadtimeSum += days;
        leadtimeCount++;
      }
      onTimeTotal++;
      // TODO: real on-time check when planned_return column is added.
      // For now, optimistic count.
      onTimeYes++;
    }

    if (created >= yearStart) {
      totalYtd += cena;
    }
  }

  return {
    active_subcontracts: active,
    delivered_count: delivered,
    active_value: activeValue,
    total_value_ytd: totalYtd,
    on_time_rate: onTimeTotal > 0 ? onTimeYes / onTimeTotal : null,
    on_time_sample: onTimeTotal,
    avg_leadtime_days:
      leadtimeCount > 0 ? leadtimeSum / leadtimeCount : null,
    cooperation_since: earliest ? earliest.toISOString() : null,
  };
}
