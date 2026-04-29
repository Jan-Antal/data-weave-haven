/**
 * Materiál tab — types (rewritten for new schema, PR #6).
 *
 * Tables:
 *   tpv_material              — material catalog (project-scoped)
 *   tpv_material_item_link    — N:M to tpv_items
 *   tpv_material_sample       — sampling alternatives
 *
 * Workflow stavy:
 *   extracted    — AI extraction landed, awaits review
 *   needs_review — flagged for human review
 *   confirmed    — confirmed real item (post-review)
 *   sampling     — sampling round in progress
 *   sample_ok    — approved by client
 *   specified    — final spec + price done
 *   ordering     — order being prepared
 *   ordered      — sent to supplier
 *   delivered    — physically received
 */

import type { TpvItemRef, ProjectRef } from "../shared/types";

// ============================================================
// CONSTANTS
// ============================================================

export const MATERIAL_STAV = [
  "extracted",
  "needs_review",
  "confirmed",
  "sampling",
  "sample_ok",
  "specified",
  "ordering",
  "ordered",
  "delivered",
] as const;
export type MaterialStav = (typeof MATERIAL_STAV)[number];

export const STAV_LABEL: Record<MaterialStav, string> = {
  extracted: "Vyťažené (AI)",
  needs_review: "Treba prejsť",
  confirmed: "Potvrdené",
  sampling: "Vzorovanie",
  sample_ok: "Vzorka OK",
  specified: "Špecifikované",
  ordering: "Pripravuje sa objednávka",
  ordered: "Objednané",
  delivered: "Dodané",
};

export const STAV_TONE: Record<MaterialStav, "neutral" | "info" | "warn" | "ok" | "primary"> = {
  extracted: "neutral",
  needs_review: "warn",
  confirmed: "info",
  sampling: "primary",
  sample_ok: "info",
  specified: "info",
  ordering: "warn",
  ordered: "info",
  delivered: "ok",
};

export const PREFIX_OPTIONS = ["M", "U"] as const;
export type MaterialPrefix = (typeof PREFIX_OPTIONS)[number];

export const KATEGORIA_OPTIONS = [
  "ltd",
  "mdf",
  "dyha",
  "kompakt",
  "sklo",
  "zrkadlo",
  "kamen",
  "uchytka",
  "kovanie",
  "noha",
  "led",
  "ine",
] as const;
export type MaterialKategoria = (typeof KATEGORIA_OPTIONS)[number];

export const KATEGORIA_LABEL: Record<MaterialKategoria, string> = {
  ltd: "LTD",
  mdf: "MDF",
  dyha: "Dýha",
  kompakt: "Kompakt",
  sklo: "Sklo",
  zrkadlo: "Zrkadlo",
  kamen: "Kameň",
  uchytka: "Úchytka",
  kovanie: "Kovanie",
  noha: "Nábytková noha",
  led: "LED",
  ine: "Iné",
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
  "bm",
] as const;

// Sample workflow
export const SAMPLE_STAV = [
  "navrhnute",
  "objednane",
  "dorucene",
  "schvalene",
  "zamietnute",
] as const;
export type SampleStav = (typeof SAMPLE_STAV)[number];

export const SAMPLE_STAV_LABEL: Record<SampleStav, string> = {
  navrhnute: "Navrhnuté",
  objednane: "Objednané",
  dorucene: "Doručené",
  schvalene: "Schválené klientom",
  zamietnute: "Zamietnuté",
};

// ============================================================
// DB ROWS
// ============================================================

export interface TpvMaterialRow {
  id: string;
  project_id: string;
  internal_code: string | null;
  prefix: MaterialPrefix | null;
  nazov: string;
  specifikacia: string | null;
  hrana: string | null;
  kategoria: string | null;
  dodava_arkhe: boolean;
  nutno_vzorovat: boolean;
  poznamky: string | null;
  mnozstvo_kumulovane: number | null;
  jednotka: string | null;
  cena_jednotkova: number | null;
  cena_celkova: number | null;
  mena: string;
  dodavatel_id: string | null;
  produkt_ref: string | null;
  stav: MaterialStav;
  ai_extracted: boolean;
  ai_confidence: number | null;
  ai_source_doc: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface TpvMaterialItemLinkRow {
  id: string;
  material_id: string;
  tpv_item_id: string;
  mnozstvo_per_item: number | null;
  jednotka: string | null;
  occurrences: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TpvMaterialSampleRow {
  id: string;
  material_id: string;
  poradie: number;
  nazov_vzorky: string;
  specifikacia: string | null;
  foto_url: string | null;
  stav: SampleStav;
  schvalene_kym: string | null;
  schvalene_kedy: string | null;
  zamietnutie_dovod: string | null;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VIEW MODELS
// ============================================================

/** Material with project ref and link info (one row per material). */
export interface MaterialView extends TpvMaterialRow {
  project: Pick<
    ProjectRef,
    "project_id" | "project_name" | "pm" | "klient" | "status" | "is_active"
  > | null;
  /** All linked tpv_items via tpv_material_item_link (with mnozstvo_per_item). */
  links: Array<
    TpvMaterialItemLinkRow & {
      tpv_item: Pick<
        TpvItemRef,
        "id" | "project_id" | "item_code" | "nazev" | "popis" | "status"
      >;
    }
  >;
  supplier: {
    id: string;
    nazov: string | null;
  } | null;
}

/** Sample with parent material reference. */
export interface SampleView extends TpvMaterialSampleRow {
  material: Pick<
    TpvMaterialRow,
    "id" | "internal_code" | "nazov" | "specifikacia" | "project_id"
  >;
}

// ============================================================
// FILTERS
// ============================================================

export interface MaterialFilters {
  project_id?: string;
  prefix?: MaterialPrefix;
  kategoria?: string;
  stav?: MaterialStav | MaterialStav[];
  dodava_arkhe?: boolean;
  nutno_vzorovat?: boolean;
  ai_extracted?: boolean;
  search?: string;
  active_only?: boolean;
}

// ============================================================
// MUTATION INPUTS
// ============================================================

export interface CreateMaterialInput {
  project_id: string;
  internal_code?: string | null;
  prefix?: MaterialPrefix | null;
  nazov: string;
  specifikacia?: string | null;
  hrana?: string | null;
  kategoria?: string | null;
  dodava_arkhe?: boolean;
  nutno_vzorovat?: boolean;
  poznamky?: string | null;
  jednotka?: string | null;
  cena_jednotkova?: number | null;
  mena?: string;
  dodavatel_id?: string | null;
  produkt_ref?: string | null;
  stav?: MaterialStav;
  ai_extracted?: boolean;
  ai_confidence?: number | null;
  ai_source_doc?: string | null;
}

export interface UpdateMaterialInput {
  id: string;
  internal_code?: string | null;
  prefix?: MaterialPrefix | null;
  nazov?: string;
  specifikacia?: string | null;
  hrana?: string | null;
  kategoria?: string | null;
  dodava_arkhe?: boolean;
  nutno_vzorovat?: boolean;
  poznamky?: string | null;
  jednotka?: string | null;
  cena_jednotkova?: number | null;
  mena?: string;
  dodavatel_id?: string | null;
  produkt_ref?: string | null;
  stav?: MaterialStav;
}

export interface UpsertLinkInput {
  material_id: string;
  tpv_item_id: string;
  mnozstvo_per_item?: number | null;
  jednotka?: string | null;
  occurrences?: number | null;
  notes?: string | null;
}

export interface MergeMaterialsInput {
  /** Target material that will absorb the source. */
  target_id: string;
  /** Source materials to be merged into target (will be deleted). */
  source_ids: string[];
}

export interface CreateSampleInput {
  material_id: string;
  poradie?: number;
  nazov_vzorky: string;
  specifikacia?: string | null;
  foto_url?: string | null;
  poznamka?: string | null;
  stav?: SampleStav;
}

export interface UpdateSampleInput {
  id: string;
  nazov_vzorky?: string;
  specifikacia?: string | null;
  foto_url?: string | null;
  stav?: SampleStav;
  zamietnutie_dovod?: string | null;
  poznamka?: string | null;
}
