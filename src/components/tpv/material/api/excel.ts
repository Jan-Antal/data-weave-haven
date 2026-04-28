/**
 * Materiál Excel import/export.
 *
 * Stĺpce v Exceli (case-insensitive, diacritics-insensitive):
 *   prvok | kod prvku | tpv kod      → item_code (povinné, lookup na tpv_items)
 *   nazov | nazev | material         → nazov     (povinné)
 *   mnozstvo | mnozstvi | qty | pocet → mnozstvo (číslo)
 *   jednotka | unit                  → jednotka  (text)
 *   dodavatel | supplier             → dodavatel (voľný text)
 *   poznamka | note                  → poznamka
 *
 * project_id sa nemixuje cez Excel — vždy importujeme do AKTUÁLNE
 * vybratého projektu (UI dropdown). Item lookup je per project_id.
 */

import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import type {
  MaterialImportRow,
  MaterialImportError,
  MaterialImportPreview,
  MaterialView,
} from "../types";
import { STAV_LABEL } from "../types";
import { formatDateLong, formatMoneyCompact } from "../../shared/helpers";

// ============================================================
// HEADER NORMALIZATION
// ============================================================

function normalizeHeader(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const map: Record<string, string> = {
    prvok: "item_code",
    "kod prvku": "item_code",
    "tpv kod": "item_code",
    "nazov prvku": "item_code",
    "nazev prvku": "item_code",
    item: "item_code",
    item_code: "item_code",
    "kod tpv": "item_code",

    nazov: "nazov",
    nazev: "nazov",
    material: "nazov",
    "nazov materialu": "nazov",
    "nazev materialu": "nazov",

    mnozstvo: "mnozstvo",
    mnozstvi: "mnozstvo",
    quantity: "mnozstvo",
    qty: "mnozstvo",
    pocet: "mnozstvo",
    "pocet ks": "mnozstvo",

    jednotka: "jednotka",
    jednotky: "jednotka",
    unit: "jednotka",
    "merna jednotka": "jednotka",
    "m.j.": "jednotka",
    mj: "jednotka",

    dodavatel: "dodavatel",
    dodavatelia: "dodavatel",
    supplier: "dodavatel",
    "nazov dodavatela": "dodavatel",

    poznamka: "poznamka",
    note: "poznamka",
    notes: "poznamka",
    komentar: "poznamka",
  };
  return map[s] ?? null;
}

// ============================================================
// PARSE
// ============================================================

interface ImportRowRaw {
  rowIndex: number;
  item_code?: string;
  nazov?: string;
  mnozstvo?: number | string;
  jednotka?: string;
  dodavatel?: string;
  poznamka?: string;
}

/**
 * Read uploaded Excel file into raw row objects with canonical keys.
 * First row is header; unknown columns are dropped.
 */
export async function parseExcelFile(file: File): Promise<ImportRowRaw[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error("Excel súbor neobsahuje žiadny hárok.");
  const sheet = wb.Sheets[firstSheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (matrix.length === 0) return [];

  const headerRow = matrix[0];
  const colKey = headerRow.map(normalizeHeader);

  const rows: ImportRowRaw[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const data = matrix[i];
    if (!data || data.every((c) => c == null || c === "")) continue;
    const row: ImportRowRaw = { rowIndex: i + 1 };
    for (let j = 0; j < colKey.length; j++) {
      const key = colKey[j];
      if (!key) continue;
      const cell = data[j];
      if (cell == null) continue;
      const value =
        typeof cell === "string" ? cell.trim() : (cell as number | string);
      if (value === "" || value == null) continue;
      (row as Record<string, unknown>)[key] = value;
    }
    rows.push(row);
  }
  return rows;
}

// ============================================================
// VALIDATE
// ============================================================

/**
 * Validate raw rows + resolve item_code to tpv_item_id within project.
 * Returns ready-to-insert rows, plus list of fatal/warn errors.
 */
export async function validateImportRows(
  raw: ImportRowRaw[],
  projectId: string
): Promise<MaterialImportPreview> {
  const errors: MaterialImportError[] = [];
  const rows: MaterialImportRow[] = [];

  // --- 1) Normalize each row ---
  for (const r of raw) {
    const itemCodeRaw = (r.item_code as string) ?? "";
    const item_code = String(itemCodeRaw).trim();
    const nazov = String(r.nazov ?? "").trim();

    if (!item_code) {
      errors.push({
        rowIndex: r.rowIndex,
        field: "item_code",
        message: "Chýba kód prvku (napr. T01).",
      });
      continue;
    }
    if (!nazov) {
      errors.push({
        rowIndex: r.rowIndex,
        field: "nazov",
        message: "Chýba názov materiálu.",
      });
      continue;
    }

    // mnozstvo
    let mnozstvo: number | null = null;
    if (r.mnozstvo != null && r.mnozstvo !== "") {
      const n =
        typeof r.mnozstvo === "number"
          ? r.mnozstvo
          : Number(String(r.mnozstvo).replace(",", ".").trim());
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          rowIndex: r.rowIndex,
          field: "mnozstvo",
          message: `Neplatné množstvo: ${String(r.mnozstvo)}`,
        });
      } else {
        mnozstvo = n;
      }
    }

    rows.push({
      rowIndex: r.rowIndex,
      item_code,
      nazov,
      mnozstvo,
      jednotka: r.jednotka ? String(r.jednotka).trim() : null,
      dodavatel: r.dodavatel ? String(r.dodavatel).trim() : null,
      poznamka: r.poznamka ? String(r.poznamka).trim() : null,
    });
  }

  // --- 2) Resolve item_code → tpv_item_id within project_id ---
  const codes = Array.from(new Set(rows.map((r) => r.item_code)));
  const resolvedItemIds: Record<number, string | null> = {};

  if (codes.length > 0) {
    const { data, error } = await supabase
      .from("tpv_items")
      .select("id, item_code")
      .eq("project_id", projectId)
      .in("item_code", codes)
      .is("deleted_at", null);

    if (error) {
      errors.push({
        rowIndex: 0,
        field: "general",
        message: `Chyba pri načítaní TPV prvkov: ${error.message}`,
      });
    } else {
      const byCode = new Map<string, string>();
      for (const it of (data as { id: string; item_code: string }[]) ?? []) {
        byCode.set(it.item_code, it.id);
      }
      for (const r of rows) {
        const id = byCode.get(r.item_code) ?? null;
        resolvedItemIds[r.rowIndex] = id;
        if (!id) {
          errors.push({
            rowIndex: r.rowIndex,
            field: "item_code",
            message: `Prvok "${r.item_code}" v projekte neexistuje.`,
          });
        }
      }
    }
  }

  return { rows, errors, resolvedItemIds };
}

// ============================================================
// EXPORT
// ============================================================

/**
 * Build XLSX Blob from materials and trigger browser download.
 * Filename includes ISO date.
 */
export function exportMaterialsToXlsx(
  views: MaterialView[],
  filenameSuffix = "materialy"
): void {
  const aoa: (string | number | null)[][] = [
    [
      "Projekt",
      "Klient",
      "Prvok",
      "Názov materiálu",
      "Množstvo",
      "Jednotka",
      "Dodávateľ",
      "Stav",
      "Objednané",
      "Dodané",
      "Poznámka",
    ],
  ];
  for (const v of views) {
    aoa.push([
      v.project?.project_name ?? v.project_id,
      v.project?.klient ?? null,
      v.tpv_item?.item_code ?? "",
      v.nazov,
      v.mnozstvo ?? null,
      v.jednotka ?? null,
      v.dodavatel ?? null,
      STAV_LABEL[v.stav],
      v.objednane_dat ? formatDateLong(v.objednane_dat) : null,
      v.dodane_dat ? formatDateLong(v.dodane_dat) : null,
      v.poznamka ?? null,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // column widths
  ws["!cols"] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 8 },
    { wch: 36 },
    { wch: 10 },
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Materiál");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${filenameSuffix}-${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/** Build empty template Excel with header + 1 example row. */
export function downloadImportTemplate(): void {
  const aoa: (string | number)[][] = [
    [
      "prvok",
      "nazov",
      "mnozstvo",
      "jednotka",
      "dodavatel",
      "poznamka",
    ],
    ["T01", "MDF doska 18mm bielá", 12, "ks", "Demos", "matný lak"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 36 },
    { wch: 10 },
    { wch: 10 },
    { wch: 24 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Šablóna");
  XLSX.writeFile(wb, "material-import-sablona.xlsx");
}

// re-export so callers can use formatMoneyCompact for previews
export { formatMoneyCompact };
