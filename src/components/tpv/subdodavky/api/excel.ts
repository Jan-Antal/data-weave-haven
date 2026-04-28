/**
 * Excel import/export for subcontracts.
 *
 * Uses SheetJS (xlsx package) — already in data-weave-haven via Lovable.
 * If the package is missing, install: `npm i xlsx`.
 *
 * - parseExcelFile()         → raw rows from uploaded file
 * - validateImportRows()     → fatal & non-fatal validation, supplier resolution
 * - bulkInsertSubcontracts() → insert validated rows
 * - exportSubcontractsToXlsx() → build a Blob and trigger download
 */

import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import type {
  ImportRowRaw,
  ImportRowValidated,
  ImportRowError,
  ImportPreviewResult,
  ImportMode,
  SubcontractView,
  TpvSubcontractRow,
} from "../types";
import { SUBCONTRACT_STAV } from "../types";
import type { Mena, TpvSupplierRow } from "../../shared/types";
import { MENA } from "../../shared/types";
import { formatDateLong, formatMoneyCompact } from "../../shared/helpers";
import { STAV_LABELS } from "../helpers";

// ============================================================
// COLUMN MAPPING — flexible Excel column names
// ============================================================

/**
 * Normalize header cell into canonical key. Strips diacritics, lowercases,
 * matches against synonyms.
 */
function normalizeHeader(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const map: Record<string, string> = {
    projekt: "project_id",
    "project id": "project_id",
    "id projektu": "project_id",
    project_id: "project_id",
    zakazka: "project_id",
    prvok: "item_code",
    "kod prvku": "item_code",
    "tpv kod": "item_code",
    "nazov prvku": "item_code",
    "nazev prvku": "item_code",
    item: "item_code",
    item_name: "item_code",
    item_code: "item_code",
    nazov: "nazov",
    nazev: "nazov",
    operacia: "nazov",
    operace: "nazov",
    popis: "popis",
    description: "popis",
    specifikacia: "popis",
    spec: "popis",
    mnozstvo: "mnozstvo",
    mnozstvi: "mnozstvo",
    quantity: "mnozstvo",
    qty: "mnozstvo",
    pocet: "mnozstvo",
    jednotka: "jednotka",
    jednotky: "jednotka",
    unit: "jednotka",
    "merna jednotka": "jednotka",
    dodavatel: "dodavatel_nazov",
    "nazov dodavatela": "dodavatel_nazov",
    supplier: "dodavatel_nazov",
    ico: "dodavatel_ico",
    "dodavatel ico": "dodavatel_ico",
    cena: "cena_predpokladana",
    "cena predpokladana": "cena_predpokladana",
    "planovana cena": "cena_predpokladana",
    "budget cena": "cena_predpokladana",
    rozpocet: "cena_predpokladana",
    mena: "mena",
    currency: "mena",
    "potreba do": "potreba_do",
    "termin": "potreba_do",
    deadline: "potreba_do",
    "datum potreba": "potreba_do",
    poznamka: "poznamka",
    note: "poznamka",
    notes: "poznamka",
    komentar: "poznamka",
  };

  return map[s] ?? null;
}

// ============================================================
// PARSE EXCEL FILE
// ============================================================

/**
 * Read uploaded File / Blob into raw row objects with normalized keys.
 * First row is treated as header; columns we don't recognize are dropped.
 */
export async function parseExcelFile(file: File): Promise<ImportRowRaw[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel súbor neobsahuje žiadny hárok.");
  }
  const sheet = wb.Sheets[firstSheetName];

  // Read as 2D array, then map header row → canonical keys
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
    defval: null,
  });

  if (aoa.length < 2) {
    throw new Error("Excel súbor je prázdny alebo neobsahuje dáta.");
  }

  const headerRow = aoa[0];
  const columnKeys: (keyof ImportRowRaw | null)[] = headerRow.map(
    (cell) => normalizeHeader(cell) as keyof ImportRowRaw | null
  );

  const rows: ImportRowRaw[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const dataRow = aoa[i];
    if (!dataRow || dataRow.every((c) => c == null || c === "")) continue;

    const obj: ImportRowRaw = { rowNumber: i + 1 };
    columnKeys.forEach((key, colIdx) => {
      if (!key) return;
      const val = dataRow[colIdx];
      if (val == null || val === "") return;
      // Cast via unknown — the indexed write is safe because `key` came
      // from our own normalized header map.
      (obj as unknown as Record<string, unknown>)[key] = val;
    });

    rows.push(obj);
  }

  return rows;
}

// ============================================================
// VALIDATION & SUPPLIER RESOLUTION
// ============================================================

interface ResolveContext {
  validProjectIds: Set<string>;
  itemsByProject: Map<string, Map<string, string>>; // projectId → (item_code → item.id)
  suppliersByName: Map<string, TpvSupplierRow>; // lowercased nazov → row
  suppliersByIco: Map<string, TpvSupplierRow>;
}

/**
 * Pre-fetch lookup data needed to validate import rows.
 * Called once before validateImportRows().
 */
export async function buildResolveContext(
  rawRows: ImportRowRaw[]
): Promise<ResolveContext> {
  const projectIds = new Set<string>(
    rawRows.map((r) => r.project_id).filter((p): p is string => !!p)
  );

  // 1. Active project IDs
  const validProjectIds = new Set<string>();
  if (projectIds.size > 0) {
    const { data: projData } = await supabase
      .from("projects")
      .select("project_id")
      .in("project_id", Array.from(projectIds));
    (projData ?? []).forEach((p) => validProjectIds.add(p.project_id));
  }

  // 2. TPV items per project (lookup by item_code; nazev is fallback descriptor)
  const itemsByProject = new Map<string, Map<string, string>>();
  if (validProjectIds.size > 0) {
    const { data: itemData } = await supabase
      .from("tpv_items")
      .select("id, project_id, item_code, nazev")
      .in("project_id", Array.from(validProjectIds));
    for (const item of itemData ?? []) {
      if (!item.project_id || !item.item_code) continue;
      let map = itemsByProject.get(item.project_id);
      if (!map) {
        map = new Map();
        itemsByProject.set(item.project_id, map);
      }
      map.set(item.item_code.toLowerCase().trim(), item.id);
    }
  }

  // 3. Suppliers — fetch all active (small list, ~50)
  const { data: supplierData } = await supabase
    .from("tpv_supplier")
    .select("*")
    .eq("is_active", true);
  const suppliersByName = new Map<string, TpvSupplierRow>();
  const suppliersByIco = new Map<string, TpvSupplierRow>();
  for (const s of supplierData ?? []) {
    const supplier = s as TpvSupplierRow;
    if (supplier.nazov) {
      suppliersByName.set(supplier.nazov.toLowerCase().trim(), supplier);
    }
    if (supplier.ico) {
      suppliersByIco.set(supplier.ico.trim(), supplier);
    }
  }

  return { validProjectIds, itemsByProject, suppliersByName, suppliersByIco };
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Try common Czech format dd.mm.yyyy
  const cz = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/);
  if (cz) {
    const [, d, m, y] = cz;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try ISO
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) {
    return iso.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Validate raw rows. Returns validated rows ready for insert + invalid rows
 * with error messages for preview.
 */
export function validateImportRows(
  raw: ImportRowRaw[],
  ctx: ResolveContext,
  mode: ImportMode
): ImportPreviewResult {
  const valid: ImportRowValidated[] = [];
  const invalid: ImportRowError[] = [];

  for (const row of raw) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // project_id required & must exist
    if (!row.project_id) {
      errors.push("Chýba project_id");
    } else if (!ctx.validProjectIds.has(row.project_id)) {
      errors.push(`Projekt ${row.project_id} neexistuje alebo nie je aktívny`);
    }

    // nazov required
    if (!row.nazov || String(row.nazov).trim() === "") {
      errors.push("Chýba názov operácie");
    }

    // item_code optional → resolve to tpv_item_id
    let tpv_item_id: string | null = null;
    if (row.item_code && row.project_id) {
      const itemMap = ctx.itemsByProject.get(row.project_id);
      const lookup = String(row.item_code).toLowerCase().trim();
      tpv_item_id = itemMap?.get(lookup) ?? null;
      if (!tpv_item_id) {
        warnings.push(`Prvok "${row.item_code}" nebol nájdený v projekte`);
      }
    }

    // dodavatel — required only in 'with_suppliers' mode
    let dodavatel_id: string | null = null;
    if (mode === "with_suppliers") {
      if (!row.dodavatel_nazov && !row.dodavatel_ico) {
        errors.push("Chýba dodávateľ (názov alebo IČO)");
      } else {
        let supplier: TpvSupplierRow | undefined;
        if (row.dodavatel_ico) {
          supplier = ctx.suppliersByIco.get(String(row.dodavatel_ico).trim());
        }
        if (!supplier && row.dodavatel_nazov) {
          supplier = ctx.suppliersByName.get(
            String(row.dodavatel_nazov).toLowerCase().trim()
          );
        }
        if (!supplier) {
          errors.push(
            `Dodávateľ "${row.dodavatel_nazov ?? row.dodavatel_ico}" nebol nájdený v databáze`
          );
        } else {
          dodavatel_id = supplier.id;
        }
      }
    } else if (row.dodavatel_nazov || row.dodavatel_ico) {
      // draft_only mode — try to resolve, but don't fail
      let supplier: TpvSupplierRow | undefined;
      if (row.dodavatel_ico) {
        supplier = ctx.suppliersByIco.get(String(row.dodavatel_ico).trim());
      }
      if (!supplier && row.dodavatel_nazov) {
        supplier = ctx.suppliersByName.get(
          String(row.dodavatel_nazov).toLowerCase().trim()
        );
      }
      if (supplier) {
        dodavatel_id = supplier.id;
      } else {
        warnings.push(
          `Dodávateľ "${row.dodavatel_nazov ?? row.dodavatel_ico}" nenájdený — ostane bez priradenia`
        );
      }
    }

    // mena — default CZK
    let mena: Mena = "CZK";
    if (row.mena) {
      const m = String(row.mena).toUpperCase().trim() as Mena;
      if ((MENA as readonly string[]).includes(m)) {
        mena = m;
      } else {
        warnings.push(`Neznáma mena "${row.mena}", použité CZK`);
      }
    }

    // numbers
    const mnozstvo = toNumber(row.mnozstvo);
    const cena = toNumber(row.cena_predpokladana);

    // potreba_do → goes into poznamka (we don't have a column yet)
    const potrebaIso = toIsoDate(row.potreba_do);
    let poznamka = row.poznamka ? String(row.poznamka) : null;
    if (potrebaIso) {
      poznamka = poznamka
        ? `${poznamka}\nPotreba do: ${potrebaIso}`
        : `Potreba do: ${potrebaIso}`;
    }

    if (errors.length > 0) {
      invalid.push({ rowNumber: row.rowNumber, raw: row, errors });
      continue;
    }

    valid.push({
      rowNumber: row.rowNumber,
      project_id: row.project_id!,
      tpv_item_id,
      nazov: String(row.nazov).trim(),
      popis: row.popis ? String(row.popis).trim() : null,
      mnozstvo,
      jednotka: row.jednotka ? String(row.jednotka).trim() : null,
      dodavatel_id,
      cena_predpokladana: cena,
      mena,
      poznamka,
      warnings,
    });
  }

  return { valid, invalid, total: raw.length };
}

// ============================================================
// BULK INSERT
// ============================================================

/**
 * Insert validated rows. In 'with_suppliers' mode, rows with dodavatel_id
 * get stav='awarded'; in 'draft_only' mode all rows get stav='draft'.
 *
 * Returns count of inserted rows.
 */
export async function bulkInsertSubcontracts(
  validated: ImportRowValidated[],
  mode: ImportMode
): Promise<TpvSubcontractRow[]> {
  if (validated.length === 0) return [];

  const records = validated.map((row) => ({
    project_id: row.project_id,
    tpv_item_id: row.tpv_item_id,
    nazov: row.nazov,
    popis: row.popis,
    mnozstvo: row.mnozstvo,
    jednotka: row.jednotka,
    dodavatel_id: row.dodavatel_id,
    cena_predpokladana: row.cena_predpokladana,
    mena: row.mena,
    poznamka: row.poznamka,
    stav:
      mode === "with_suppliers" && row.dodavatel_id
        ? SUBCONTRACT_STAV.OBJEDNANE
        : SUBCONTRACT_STAV.NAVRH,
  }));

  const { data, error } = await supabase
    .from("tpv_subcontract")
    .insert(records)
    .select("*");

  if (error) throw error;
  return (data ?? []) as TpvSubcontractRow[];
}

// ============================================================
// EXPORT
// ============================================================

/**
 * Build an Excel workbook from current subcontract list and trigger download.
 */
export function exportSubcontractsToXlsx(
  subcontracts: SubcontractView[],
  filename = `subdodavky-${new Date().toISOString().slice(0, 10)}.xlsx`
): void {
  const rows = subcontracts.map((s) => ({
    Projekt: s.project_id,
    "Názov projektu": s.project?.project_name ?? "",
    PM: s.project?.pm ?? "",
    "Kód prvku": s.tpv_item?.item_code ?? "",
    "Operácia": s.nazov,
    "Popis": s.popis ?? "",
    "Množstvo": s.mnozstvo ?? "",
    "Jednotka": s.jednotka ?? "",
    "Dodávateľ": s.supplier?.nazov ?? "",
    "IČO": s.supplier?.ico ?? "",
    "Cena plán": s.cena_predpokladana ?? "",
    "Cena finálna": s.cena_finalna ?? "",
    "Mena": s.mena,
    "Stav": STAV_LABELS[s.stav],
    "Odoslané": s.objednane_dat ? formatDateLong(s.objednane_dat) : "",
    "Návrat plán": s.dodane_dat ? formatDateLong(s.dodane_dat) : "",
    "Vytvorené": formatDateLong(s.created_at),
    "Poznámka": s.poznamka ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.max(
      k.length,
      ...rows.map((r) => String((r as Record<string, unknown>)[k] ?? "").length)
    ),
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Subdodávky");

  XLSX.writeFile(wb, filename);
}

/**
 * Build & download an Excel template for import.
 * Two sheets: instructions + empty template with example row.
 */
export function downloadImportTemplate(mode: ImportMode): void {
  const instructions = [
    {
      Stĺpec: "Projekt",
      Povinný: "Áno",
      Popis: "ID projektu, napr. Z-2601-004",
    },
    {
      Stĺpec: "Kód prvku",
      Povinný: "Nie",
      Popis: "TPV kód prvku z projektu, napr. T01",
    },
    {
      Stĺpec: "Operácia",
      Povinný: "Áno",
      Popis: "Názov operácie, napr. Lakovanie dvierok",
    },
    { Stĺpec: "Popis", Povinný: "Nie", Popis: "Špecifikácia, RAL, rozmer" },
    {
      Stĺpec: "Množstvo",
      Povinný: "Nie",
      Popis: "Číselné množstvo, napr. 5",
    },
    { Stĺpec: "Jednotka", Povinný: "Nie", Popis: "ks, m², sada" },
    {
      Stĺpec: "Dodávateľ",
      Povinný: mode === "with_suppliers" ? "Áno" : "Nie",
      Popis: "Presný názov dodávateľa z databázy",
    },
    {
      Stĺpec: "IČO",
      Povinný: "Nie",
      Popis: "IČO dodávateľa (alternatíva k názvu)",
    },
    {
      Stĺpec: "Cena",
      Povinný: "Nie",
      Popis: "Plánovaná cena (budget) v príslušnej mene",
    },
    { Stĺpec: "Mena", Povinný: "Nie", Popis: "CZK / EUR / USD (default CZK)" },
    {
      Stĺpec: "Potreba do",
      Povinný: "Nie",
      Popis: "Termín dodania, formát dd.mm.yyyy alebo Excel dátum",
    },
    { Stĺpec: "Poznámka", Povinný: "Nie", Popis: "Voľný text" },
  ];

  const example = [
    {
      Projekt: "Z-2601-004",
      "Kód prvku": "T01",
      Operácia: "Lakovanie dvierok",
      Popis: "Matná biela RAL 9003",
      Množstvo: 5,
      Jednotka: "ks",
      Dodávateľ: "Lakovňa Novák s.r.o.",
      IČO: "",
      Cena: 12500,
      Mena: "CZK",
      "Potreba do": "30.04.2026",
      Poznámka: "",
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(instructions),
    "Inštrukcie"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(example),
    "Subdodávky"
  );

  XLSX.writeFile(wb, `import-sablona-subdodavky.xlsx`);
}
