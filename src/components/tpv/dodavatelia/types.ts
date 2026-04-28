/**
 * Dodávatelia tab — types specific to supplier CRM.
 *
 * Shared TpvSupplierRow lives in shared/types.ts since both Subdodávky
 * and Dodávatelia tabs need it.
 */

import type { Mena } from "../shared/types";

// ============================================================
// CONTACTS
// ============================================================

/** tpv_supplier_contact */
export interface TpvSupplierContactRow {
  id: string;
  supplier_id: string;
  meno: string;
  pozice: string | null;
  email: string | null;
  telefon: string | null;
  is_primary: boolean;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierContactInput {
  supplier_id: string;
  meno: string;
  pozice?: string;
  email?: string;
  telefon?: string;
  is_primary?: boolean;
  poznamka?: string;
}

export type UpdateSupplierContactInput = Partial<
  Omit<CreateSupplierContactInput, "supplier_id">
>;

// ============================================================
// PRICELIST
// ============================================================

/** tpv_supplier_pricelist */
export interface TpvSupplierPricelistRow {
  id: string;
  supplier_id: string;
  kategoria: string | null;
  polozka: string;
  cena: number;
  mena: Mena;
  jednotka: string;
  leadtime_dni: number | null;
  min_objednavka: number | null;
  poznamka: string | null;
  platne_od: string | null;
  platne_do: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierPricelistInput {
  supplier_id: string;
  kategoria?: string;
  polozka: string;
  cena: number;
  mena?: Mena;
  jednotka?: string;
  leadtime_dni?: number;
  min_objednavka?: number;
  poznamka?: string;
  platne_od?: string;
  platne_do?: string;
}

export type UpdateSupplierPricelistInput = Partial<
  Omit<CreateSupplierPricelistInput, "supplier_id">
> & { is_active?: boolean };

// ============================================================
// TASKS
// ============================================================

/** tpv_supplier_task */
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export interface TpvSupplierTaskRow {
  id: string;
  supplier_id: string;
  subcontract_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  done_at: string | null;
  done_by: string | null;
  assigned_to: string | null;
  priority: TaskPriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierTaskInput {
  supplier_id: string;
  subcontract_id?: string;
  project_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  assigned_to?: string;
  priority?: TaskPriority;
}

export type UpdateSupplierTaskInput = Partial<
  Omit<CreateSupplierTaskInput, "supplier_id">
> & { status?: TaskStatus };

// ============================================================
// COMPUTED STATS
// ============================================================

/** Computed metrics for a supplier — derived from subcontracts. */
export interface SupplierCrmStats {
  active_subcontracts: number;        // count of stav not in (dodane, zruseno)
  delivered_count: number;            // count of stav = dodane
  active_value: number;               // sum cena of active subcontracts
  total_value_ytd: number;            // sum cena of subcontracts created this year
  on_time_rate: number | null;        // 0-1, null if no delivered subcontracts
  on_time_sample: number;             // n of completed subcontracts used for the rate
  avg_leadtime_days: number | null;   // avg between objednane_dat and dodane_dat
  cooperation_since: string | null;   // earliest created_at on any subcontract
}
