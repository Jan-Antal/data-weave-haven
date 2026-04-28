/**
 * Materiál tab — types.
 *
 * tpv_material (DB, 13 columns, verified 26.4.2026):
 *   id uuid PK
 *   tpv_item_id uuid NOT NULL  → FK tpv_items.id
 *   project_id text NOT NULL   → FK projects.project_id
 *   nazov text NOT NULL
 *   mnozstvo numeric
 *   jednotka text
 *   dodavatel text             — voľný text, NIE FK na tpv_supplier
 *   objednane_dat date
 *   dodane_dat date
 *   stav text NOT NULL         CHECK (nezadany|objednane|caka|dodane)
 *   poznamka text
 *   created_at timestamptz NOT NULL
 *   updated_at timestamptz NOT NULL
 */

import type { TpvItemRef, ProjectRef } from "../shared/types";

// ============================================================
// CONSTANTS
// ============================================================

export const MATERIAL_STAV = ["nezadany", "objednane", "caka", "dodane"] as const;
export type MaterialStav = (typeof MATERIAL_STAV)[number];

export const STAV_LABEL: Record<MaterialStav, string> = {
  nezadany: "Nezadané",
  objednane: "Objednané",
  caka: "Čaká na dodanie",
  dodane: "Dodané",
};

export const STAV_TONE: Record<MaterialStav, "neutral" | "info" | "warn" | "ok"> = {
  nezadany: "neutral",
  objednane: "info",
  caka: "warn",
  dodane: "ok",
};

export const JEDNOTKA_OPTIONS = [
  "ks",
  "m",
  "m²",
  "m³",
  "kg",
  "l",
  "bal",
  "set",
] as const;

// ============================================================
// DB ROW
// ============================================================

export interface TpvMaterialRow {
  id: string;
  tpv_item_id: string;
  project_id: string;
  nazov: string;
  mnozstvo: number | null;
  jednotka: string | null;
  dodavatel: string | null;
  objednane_dat: string | null;
  dodane_dat: string | null;
  stav: MaterialStav;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VIEW MODEL — row joined with tpv_item + project
// ============================================================

export interface MaterialView extends TpvMaterialRow {
  tpv_item: Pick<
    TpvItemRef,
    "id" | "project_id" | "item_code" | "nazev" | "popis" | "status"
  > | null;
  project: Pick<
    ProjectRef,
    "project_id" | "project_name" | "pm" | "klient" | "status" | "is_active"
  > | null;
}

// ============================================================
// FILTERS
// ============================================================

export interface MaterialFilters {
  project_id?: string;
  tpv_item_id?: string;
  stav?: MaterialStav | MaterialStav[];
  search?: string;
  /** Iba aktívne projekty? Default true. */
  active_only?: boolean;
  /** Iba s dodávateľom? */
  has_dodavatel?: boolean;
  /** Iba po termíne (objednane > 14 dní bez dodania)? */
  overdue_only?: boolean;
}

// ============================================================
// CREATE / UPDATE INPUTS
// ============================================================

export interface CreateMaterialInput {
  tpv_item_id: string;
  project_id: string;
  nazov: string;
  mnozstvo?: number | null;
  jednotka?: string | null;
  dodavatel?: string | null;
  poznamka?: string | null;
  /** default 'nezadany' */
  stav?: MaterialStav;
}

export interface UpdateMaterialInput {
  id: string;
  nazov?: string;
  mnozstvo?: number | null;
  jednotka?: string | null;
  dodavatel?: string | null;
  objednane_dat?: string | null;
  dodane_dat?: string | null;
  stav?: MaterialStav;
  poznamka?: string | null;
}

// ============================================================
// EXCEL IMPORT
// ============================================================

/** Single row pulled out of an Excel sheet — pre-validation. */
export interface MaterialImportRow {
  /** 1-based row index in the source sheet (for error reporting). */
  rowIndex: number;
  /** Item code lookup target — e.g. "T01". Resolved to tpv_item_id. */
  item_code: string;
  nazov: string;
  mnozstvo: number | null;
  jednotka: string | null;
  dodavatel: string | null;
  poznamka: string | null;
}

export interface MaterialImportError {
  rowIndex: number;
  field: keyof MaterialImportRow | "general";
  message: string;
}

export interface MaterialImportPreview {
  rows: MaterialImportRow[];
  errors: MaterialImportError[];
  /** Resolved per-row: tpv_item_id we'd insert with. */
  resolvedItemIds: Record<number, string | null>;
}

// ============================================================
// AGGREGATES
// ============================================================

/** Per-project material summary. Used in Per-projekt view header. */
export interface MaterialProjectSummary {
  project_id: string;
  project_name: string | null;
  total: number;
  nezadany: number;
  objednane: number;
  caka: number;
  dodane: number;
  /** items overdue: objednané > 14d ago bez dodania */
  overdue: number;
}
