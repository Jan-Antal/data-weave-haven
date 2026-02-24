import { createContext, useContext, ReactNode } from "react";
import { useColumnVisibility, ColumnDef } from "@/hooks/useColumnVisibility";

// ── Master column registry ─────────────────────────────────────────
// Every toggleable column in the app. Locked columns are separate.
export const ALL_COLUMNS: ColumnDef[] = [
  { key: "klient", label: "Klient" },
  { key: "location", label: "Lokace" },
  { key: "kalkulant", label: "Kalkulant" },
  { key: "architekt", label: "Architekt" },
  { key: "datum_smluvni", label: "Datum Smluvní" },
  { key: "datum_objednavky", label: "Datum Objednávky" },
  { key: "prodejni_cena", label: "Prodejní cena" },
  { key: "marze", label: "Marže" },
  { key: "link_cn", label: "CN" },
  { key: "pm", label: "PM" },
  { key: "status", label: "Status" },
  { key: "risk", label: "Risk" },
  { key: "zamereni", label: "Zaměření" },
  { key: "tpv_date", label: "TPV" },
  { key: "expedice", label: "Expedice" },
  { key: "montaz", label: "Montáž" },
  { key: "predani", label: "Předání" },
  { key: "pm_poznamka", label: "Poznámka PM" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "narocnost", label: "Náročnost" },
  { key: "hodiny_tpv", label: "Hodiny TPV" },
  { key: "percent_tpv", label: "% Rozpracovanost" },
  { key: "tpv_poznamka", label: "Poznámka TPV" },
];

const LOCKED: ColumnDef[] = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
];

// ── Native column keys per tab ──────────────────────────────────────
export const PROJECT_INFO_NATIVE = [
  "klient", "location", "kalkulant", "architekt",
  "datum_smluvni", "datum_objednavky", "prodejni_cena", "marze", "link_cn",
];
export const PM_NATIVE = [
  "pm", "status", "risk", "zamereni", "tpv_date",
  "expedice", "montaz", "predani", "pm_poznamka",
];
export const TPV_NATIVE = [
  "konstrukter", "narocnost", "hodiny_tpv", "percent_tpv", "tpv_poznamka",
];

// Full column list for each tab = locked + all toggleable
const FULL_COLUMNS: ColumnDef[] = [...LOCKED, ...ALL_COLUMNS];

// Columns hidden by default = everything NOT native to that tab
function defaultHidden(nativeKeys: string[]): string[] {
  return ALL_COLUMNS.filter((c) => !nativeKeys.includes(c.key)).map((c) => c.key);
}

// ── Groups for the toggle panel ─────────────────────────────────────
export const COLUMN_GROUPS = [
  { label: "Project Info", keys: PROJECT_INFO_NATIVE },
  { label: "PM Status", keys: PM_NATIVE },
  { label: "TPV Status", keys: TPV_NATIVE },
];

// ── Context types ───────────────────────────────────────────────────
export interface ColumnVisibilityState {
  isVisible: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  columns: ColumnDef[];
  hiddenColumns: Set<string>;
}

interface ColumnVisibilityContextType {
  projectInfo: ColumnVisibilityState;
  pmStatus: ColumnVisibilityState;
  tpvStatus: ColumnVisibilityState;
}

const Ctx = createContext<ColumnVisibilityContextType | null>(null);

export function ColumnVisibilityProvider({ children }: { children: ReactNode }) {
  const projectInfo = useColumnVisibility("col-vis-project-info", FULL_COLUMNS, defaultHidden(PROJECT_INFO_NATIVE));
  const pmStatus = useColumnVisibility("col-vis-pm-status", FULL_COLUMNS, defaultHidden(PM_NATIVE));
  const tpvStatus = useColumnVisibility("col-vis-tpv-status", FULL_COLUMNS, defaultHidden(TPV_NATIVE));

  return (
    <Ctx.Provider value={{ projectInfo, pmStatus, tpvStatus }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAllColumnVisibility() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ColumnVisibilityProvider missing");
  return ctx;
}
