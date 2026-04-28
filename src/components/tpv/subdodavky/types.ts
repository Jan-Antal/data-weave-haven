/**
 * Subdodávky tab — types specific to subcontracts and RFQ flow.
 *
 * Shared types (Mena, AppRole, TpvSupplierRow, TpvItemRef, ProjectRef,
 * audit, full TpvPermissions) live in shared/types.ts.
 */

import type {
  Mena,
  TpvSupplierRow,
  TpvItemRef,
  ProjectRef,
  TpvPermissions,
} from "../shared/types";

/**
 * Subdodávky-specific permissions subset. The TPV root component computes
 * `TpvPermissions` once and the Subdodávky tab projects it down to this
 * smaller shape via `subcontractPermissionsFromTpv()` (in helpers.ts).
 */
export interface SubcontractPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSendRFQ: boolean;
  canAwardRFQ: boolean;
  canManageSupplier: boolean;
}

/** Project a full TpvPermissions to the Subdodávky-specific subset. */
export function subcontractPermissionsFromTpv(
  tpv: TpvPermissions
): SubcontractPermissions {
  return {
    canView: tpv.canView,
    canCreate: tpv.canCreateSubcontract,
    canEdit: tpv.canEditSubcontract,
    canDelete: tpv.canDeleteSubcontract,
    canSendRFQ: tpv.canSendRFQ,
    canAwardRFQ: tpv.canAwardRFQ,
    canManageSupplier: tpv.canManageSupplier,
  };
}

// ============================================================
// SUBCONTRACT STATUS ENUMS
// ============================================================

/** tpv_subcontract.stav — DB CHECK constraint:
 *  ('navrh','rfq','ponuka','objednane','dodane','zruseno') */
export const SUBCONTRACT_STAV = {
  NAVRH: "navrh",
  RFQ: "rfq",
  PONUKA: "ponuka",
  OBJEDNANE: "objednane",
  DODANE: "dodane",
  ZRUSENO: "zruseno",
} as const;

export type SubcontractStav =
  (typeof SUBCONTRACT_STAV)[keyof typeof SUBCONTRACT_STAV];

/** tpv_subcontract_request.stav — DB CHECK constraint:
 *  ('sent','received','accepted','rejected') */
export const REQUEST_STAV = {
  SENT: "sent",
  RECEIVED: "received",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;

export type RequestStav = (typeof REQUEST_STAV)[keyof typeof REQUEST_STAV];

// ============================================================
// DB ROW TYPES
// ============================================================

/** tpv_subcontract — 17 stĺpcov */
export interface TpvSubcontractRow {
  id: string;
  project_id: string;
  tpv_item_id: string | null;
  nazov: string;
  popis: string | null;
  mnozstvo: number | null;
  jednotka: string | null;
  dodavatel_id: string | null;
  cena_predpokladana: number | null;
  cena_finalna: number | null;
  mena: Mena;
  stav: SubcontractStav;
  objednane_dat: string | null;
  dodane_dat: string | null;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
}

/** tpv_subcontract_request — 12 stĺpcov */
export interface TpvSubcontractRequestRow {
  id: string;
  subcontract_id: string;
  supplier_id: string;
  sent_at: string | null;
  responded_at: string | null;
  cena_nabidka: number | null;
  mena: Mena | null;
  termin_dodani: string | null;
  stav: RequestStav;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VIEW MODELS (komponovaný row + relácie pre UI)
// ============================================================

/** Subcontract s naplnenými reláciami pre UI */
export interface SubcontractView extends TpvSubcontractRow {
  supplier: TpvSupplierRow | null;
  tpv_item: TpvItemRef | null;
  project: ProjectRef | null;
  requests: SubcontractRequestView[];
}

/** RFQ request s naplneným dodávateľom */
export interface SubcontractRequestView extends TpvSubcontractRequestRow {
  supplier: TpvSupplierRow;
}

/** Per-project grouped view — pre accordion */
export interface ProjectSubcontractGroup {
  project: ProjectRef;
  subcontracts: SubcontractView[];
  total_predpokladana: number;
  total_finalna: number;
  count_by_stav: Record<SubcontractStav, number>;
}

// ============================================================
// FORM TYPES
// ============================================================

export interface CreateSubcontractInput {
  project_id: string;
  tpv_item_id?: string | null;
  nazov: string;
  popis?: string;
  mnozstvo?: number;
  jednotka?: string;
  dodavatel_id?: string;
  cena_predpokladana?: number;
  mena: Mena;
  poznamka?: string;
}

export interface UpdateSubcontractInput {
  nazov?: string;
  popis?: string;
  mnozstvo?: number;
  jednotka?: string;
  cena_predpokladana?: number;
  cena_finalna?: number;
  mena?: Mena;
  stav?: SubcontractStav;
  objednane_dat?: string | null;
  dodane_dat?: string | null;
  poznamka?: string;
}

export interface CreateRFQRequestInput {
  subcontract_id: string;
  /** For single-supplier creation. Set ONE of supplier_id OR supplier_ids. */
  supplier_id?: string;
  /** For bulk creation — preferred for "Send RFQ to N suppliers" flow. */
  supplier_ids: string[];
  poznamka?: string;
}

export interface UpdateRFQRequestInput {
  cena_nabidka?: number;
  mena?: Mena;
  termin_dodani?: string;
  stav?: RequestStav;
  responded_at?: string;
  poznamka?: string;
}

// ============================================================
// FILTERS
// ============================================================

export interface SubcontractFilters {
  project_id?: string;
  supplier_id?: string;
  dodavatel_id?: string;
  /** Tri-state: undefined = no filter, true = only with supplier, false = only without */
  has_supplier?: boolean;
  stav?: SubcontractStav | SubcontractStav[];
  search?: string;
}

// ============================================================
// EXCEL IMPORT/EXPORT
// ============================================================

export type ImportMode =
  | "draft_only"        // Bulk vytvor draft subdodávok zo zoznamu (PM dopní detail)
  | "with_suppliers";   // Plný import s dodávateľmi a cenami

/** Jeden riadok Excel importu — pred validáciou */
export interface ImportRowRaw {
  rowNumber: number;
  project_id?: string;
  item_code?: string;                 // optional — looks up tpv_item_id
  nazov?: string;
  popis?: string;
  mnozstvo?: string | number;
  jednotka?: string;
  dodavatel_nazov?: string;
  dodavatel_ico?: string;
  cena_predpokladana?: string | number;
  mena?: string;
  potreba_do?: string | Date;
  poznamka?: string;
}

/** Validated + resolved row — ready for insert */
export interface ImportRowValidated {
  rowNumber: number;
  project_id: string;
  tpv_item_id: string | null;
  nazov: string;
  popis: string | null;
  mnozstvo: number | null;
  jednotka: string | null;
  dodavatel_id: string | null;
  cena_predpokladana: number | null;
  mena: Mena;
  poznamka: string | null;
  warnings: string[];
}

/** Row that failed validation — shown in preview, NOT imported */
export interface ImportRowError {
  rowNumber: number;
  raw: ImportRowRaw;
  errors: string[];
}

export interface ImportPreviewResult {
  valid: ImportRowValidated[];
  invalid: ImportRowError[];
  total: number;
}
