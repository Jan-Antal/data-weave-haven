/**
 * Shared TPV module types — used by all tabs (Príprava, Subdodávky,
 * Materiál, Hodiny, Dodávatelia).
 *
 * Tab-specific types live in their respective subfolders:
 *   - subdodavky/types.ts
 *   - dodavatelia/types.ts
 *   - priprava/types.ts
 *   - material/types.ts
 *   - hodiny/types.ts
 */

// ============================================================
// CONSTANTS
// ============================================================

/** Mena — currency. */
export const MENA = ["CZK", "EUR", "USD"] as const;
export type Mena = (typeof MENA)[number];

// ============================================================
// READ-ONLY REFS — entities owned by other modules
// ============================================================

/**
 * tpv_items — read-only reference into the Project Info module.
 * TPV tabs MUST NOT modify these rows. Edits happen in Project Info.
 *
 * Real DB schema (verified 26.4.2026): 21 columns total. Module picks
 * the subset relevant for cross-references.
 */
export interface TpvItemRef {
  id: string;
  project_id: string;
  item_code: string;          // T01, T08, T23_b...
  nazev: string | null;       // "Sedačka se schodami", "TV Skříňka - U708 ST9"
  popis: string | null;       // dlhší voľný popis
  status: string | null;      // "Schváleno", "V příprave"...
  pocet: number | null;
  cena: number | null;
  konstrukter: string | null; // ext z Project Info
  stage_id: string | null;    // FK na project_stages — read-only ref
}

/**
 * projects — read-only reference. Edits happen in Project Info.
 *
 * Real DB has 58 columns; we pick what TPV tabs need.
 */
export interface ProjectRef {
  project_id: string;         // PK in DB
  project_name: string | null;
  pm: string | null;
  konstrukter: string | null;
  status: string | null;
  klient: string | null;
  expedice: string | null;    // text — termín expedicie
  predani: string | null;     // text — termín predaný
  is_active: boolean;
}

// ============================================================
// SHARED ENTITY — TpvSupplier
// ============================================================
// tpv_supplier is owned by the TPV module. Both Subdodávky and
// Dodávatelia tabs read/write this table; lives in shared types.

export interface TpvSupplierRow {
  id: string;
  nazov: string;
  ico: string | null;
  dic: string | null;
  kontakt_meno: string | null;
  kontakt_email: string | null;
  kontakt_telefon: string | null;
  kontakt_pozice: string | null;
  web: string | null;
  adresa: string | null;
  kategorie: string[] | null; // text[] — Lakovanie, Sklo, CNC...
  rating: number | null;      // 1-5 hviezdy
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// AUTH / ROLES
// ============================================================

/** Reálny app_role enum z DB (overené 28.4.2026):
 *  owner, admin, vedouci_pm, pm, nakupci, vedouci_konstrukter,
 *  konstrukter, vedouci_vyroby, mistr, quality, kalkulant,
 *  finance, viewer, tester, vyroba.
 *
 *  Note: nakupci uz v DB existuje, netreba ALTER TYPE. */
export type AppRole =
  | "owner"
  | "admin"
  | "vedouci_pm"
  | "pm"
  | "nakupci"
  | "vedouci_konstrukter"
  | "konstrukter"
  | "vedouci_vyroby"
  | "mistr"
  | "quality"
  | "kalkulant"
  | "finance"
  | "viewer"
  | "tester"
  | "vyroba";

/** Permissions for the whole TPV module — derived once at the top level
 *  and passed down to each tab. */
export interface TpvPermissions {
  // General
  canView: boolean;
  // Subdodávky
  canCreateSubcontract: boolean;
  canEditSubcontract: boolean;
  canDeleteSubcontract: boolean;
  canSendRFQ: boolean;
  canAwardRFQ: boolean;
  // Dodávatelia (CRM)
  canManageSupplier: boolean;
  // Materiál
  canEditMaterial: boolean;
  // Hodiny
  canSubmitHours: boolean;
  canApproveHours: boolean;
  // Príprava
  canEditPreparation: boolean;
}

// ============================================================
// AUDIT LOG — shared infra for change tracking
// ============================================================

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

/** tpv_audit_log — audit trail row. Written by Postgres triggers, not client. */
export interface TpvAuditLogRow {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  project_id: string | null;
  subcontract_id: string | null;
  supplier_id: string | null;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
  summary: string | null;
}

export interface AuditLogFilters {
  subcontract_id?: string;
  supplier_id?: string;
  project_id?: string;
  table_name?: string;
  actor_id?: string;
  limit?: number;
}
