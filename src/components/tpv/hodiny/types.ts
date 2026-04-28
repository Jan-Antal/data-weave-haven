/**
 * Hodiny tab — types.
 *
 * tpv_hours_allocation (DB, 13 cols):
 *   id uuid PK
 *   project_id text NOT NULL
 *   tpv_item_id uuid NOT NULL          → FK tpv_items.id
 *   hodiny_navrh numeric                — návrh kalkulanta
 *   stav text NOT NULL                  CHECK (draft|submitted|approved|returned)
 *   submitted_by uuid                   FK auth.users.id (kalkulant)
 *   submitted_at timestamptz
 *   approved_by uuid                    FK auth.users.id (PM)
 *   approved_at timestamptz
 *   return_reason text                  vyplnené pri stav='returned'
 *   notes text
 *   created_at, updated_at timestamptz NOT NULL
 *
 *   UNIQUE(project_id, tpv_item_id)     — jeden záznam per prvok
 *
 * Workflow:
 *   draft       — kalkulant pracuje, ešte neodoslané
 *   submitted   — odoslané PM na schválenie
 *   approved    — PM schválil
 *   returned    — PM vrátil späť kalkulantovi s reason
 */

import type { TpvItemRef, ProjectRef } from "../shared/types";

// ============================================================
// CONSTANTS
// ============================================================

export const HOURS_STAV = [
  "draft",
  "submitted",
  "approved",
  "returned",
] as const;
export type HoursStav = (typeof HOURS_STAV)[number];

export const HOURS_STAV_LABEL: Record<HoursStav, string> = {
  draft: "Rozpracované",
  submitted: "Odoslané PM",
  approved: "Schválené",
  returned: "Vrátené",
};

// ============================================================
// DB ROW
// ============================================================

export interface TpvHoursAllocationRow {
  id: string;
  project_id: string;
  tpv_item_id: string;
  hodiny_navrh: number | null;
  stav: HoursStav;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  return_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VIEW MODELS
// ============================================================

/**
 * Per-prvok view — combines:
 *   - existing allocation row (or virtual if none yet)
 *   - tpv_item with hodiny_plan (CN — original calculated value)
 *   - project ref
 */
export interface HoursAllocationView extends TpvHoursAllocationRow {
  tpv_item: Pick<
    TpvItemRef,
    "id" | "project_id" | "item_code" | "nazev" | "popis" | "status"
  > & {
    hodiny_plan: number | null;
    hodiny_source: string | null;
  };
  project: Pick<
    ProjectRef,
    "project_id" | "project_name" | "pm" | "klient" | "status" | "is_active"
  > | null;
  /** True when no DB row exists yet — UI knows to upsert on first edit. */
  isVirtual?: boolean;
}

/** Per-project rollup — pre Projekty zoznam. */
export interface HoursProjectRollup {
  project_id: string;
  project_name: string | null;
  pm: string | null;
  klient: string | null;
  total_items: number;
  /** count by allocation stav */
  draft: number;
  submitted: number;
  approved: number;
  returned: number;
  /** items with no allocation yet */
  missing: number;
  /** sum of hodiny_plan across all items (CN) */
  sum_plan: number;
  /** sum of hodiny_navrh from ALL allocations */
  sum_navrh: number;
  /** sum of hodiny_navrh from approved only */
  sum_approved: number;
}

// ============================================================
// FILTERS
// ============================================================

export interface HoursFilters {
  project_id?: string;
  stav?: HoursStav | HoursStav[];
  active_only?: boolean;
  /** Iba moje (current user submitted_by)? */
  mine_only?: boolean;
  /** Iba čakajúce na moje schválenie (PM, stav=submitted)? */
  pending_my_review?: boolean;
}

// ============================================================
// MUTATION INPUTS
// ============================================================

export interface UpsertAllocationInput {
  project_id: string;
  tpv_item_id: string;
  hodiny_navrh: number | null;
  notes?: string | null;
  stav?: HoursStav;
}

export interface SubmitAllocationInput {
  id: string;
  hodiny_navrh?: number | null;
  notes?: string | null;
}

export interface ApproveAllocationInput {
  id: string;
}

export interface ReturnAllocationInput {
  id: string;
  return_reason: string;
}
