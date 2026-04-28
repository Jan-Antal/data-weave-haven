/**
 * Príprava tab — types.
 *
 * tpv_project_preparation (DB, 8 cols) — per-project aggregate:
 *   id uuid PK
 *   project_id text NOT NULL  (1:1 with projects)
 *   calc_status text NOT NULL    CHECK (draft|review|released)
 *   readiness_overall numeric    (0-1)
 *   target_release_date date
 *   notes text
 *   created_at, updated_at
 *
 * tpv_preparation (DB, 10 cols) — per-item readiness:
 *   id uuid PK
 *   tpv_item_id uuid NOT NULL UNIQUE  → 1:1 with tpv_items
 *   project_id text NOT NULL
 *   doc_ok boolean NOT NULL
 *   hodiny_manual numeric
 *   hodiny_schvalene boolean NOT NULL
 *   readiness_status text NOT NULL    CHECK (rozpracovane|ready|riziko|blokovane)
 *   notes text
 *   created_at, updated_at
 *
 * Workflow:
 *   - per-item: each tpv_item has one preparation row
 *     - doc_ok        ← konstruktér (Karel) maps documentation status
 *     - hodiny_schvalene ← derived from tpv_hours_allocation.stav='approved'
 *     - readiness_status ← computed or manually overridden
 *   - per-project: aggregate
 *     - calc_status     manually managed (draft → review → released)
 *     - readiness_overall computed: count(ready)/total
 */

import type { TpvItemRef, ProjectRef } from "../shared/types";

// ============================================================
// CONSTANTS
// ============================================================

export const READINESS_STATUS = [
  "rozpracovane",
  "ready",
  "riziko",
  "blokovane",
] as const;
export type ReadinessStatus = (typeof READINESS_STATUS)[number];

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  rozpracovane: "Rozpracované",
  ready: "Pripravené",
  riziko: "Riziko",
  blokovane: "Blokované",
};

export const CALC_STATUS = ["draft", "review", "released"] as const;
export type CalcStatus = (typeof CALC_STATUS)[number];

export const CALC_STATUS_LABEL: Record<CalcStatus, string> = {
  draft: "Návrh",
  review: "Kontrola",
  released: "Uvoľnené do výroby",
};

// ============================================================
// DB ROWS
// ============================================================

export interface TpvProjectPreparationRow {
  id: string;
  project_id: string;
  calc_status: CalcStatus;
  readiness_overall: number | null;
  target_release_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TpvPreparationRow {
  id: string;
  tpv_item_id: string;
  project_id: string;
  doc_ok: boolean;
  hodiny_manual: number | null;
  hodiny_schvalene: boolean;
  readiness_status: ReadinessStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VIEW MODELS
// ============================================================

export interface PreparationItemView extends TpvPreparationRow {
  tpv_item: Pick<
    TpvItemRef,
    "id" | "project_id" | "item_code" | "nazev" | "popis" | "status"
  > & {
    hodiny_plan: number | null;
  };
  isVirtual?: boolean;
}

/** Per-project view with project ref + per-item summary. */
export interface ProjectPreparationView extends TpvProjectPreparationRow {
  project: Pick<
    ProjectRef,
    "project_id" | "project_name" | "pm" | "klient" | "status" | "is_active"
  > | null;
  /** total tpv_items count */
  total_items: number;
  /** count by readiness_status */
  rozpracovane: number;
  ready: number;
  riziko: number;
  blokovane: number;
  /** items with doc_ok = true */
  doc_ok_count: number;
  /** items with hodiny approved */
  hodiny_approved_count: number;
  /** materials with stav='dodane' (joined from tpv_material) */
  materials_delivered: number;
  materials_total: number;
  /** subcontracts with stav='delivered' (joined) */
  subcontracts_delivered: number;
  subcontracts_total: number;
  /** True when all gates pass — can release to Plán Výroby */
  can_release: boolean;
}

// ============================================================
// FILTERS
// ============================================================

export interface PreparationFilters {
  calc_status?: CalcStatus;
  active_only?: boolean;
  /** show only projects ready to release (gates pass) */
  ready_only?: boolean;
}

// ============================================================
// MUTATION INPUTS
// ============================================================

export interface UpdateProjectPreparationInput {
  project_id: string;
  calc_status?: CalcStatus;
  target_release_date?: string | null;
  notes?: string | null;
}

export interface UpsertItemPreparationInput {
  project_id: string;
  tpv_item_id: string;
  doc_ok?: boolean;
  hodiny_manual?: number | null;
  hodiny_schvalene?: boolean;
  readiness_status?: ReadinessStatus;
  notes?: string | null;
}
