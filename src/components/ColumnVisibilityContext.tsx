import { createContext, useContext, ReactNode, useMemo } from "react";
import { useColumnVisibility, ColumnDef } from "@/hooks/useColumnVisibility";

// Native columns per tab (excluding locked project_id/project_name)
const PROJECT_INFO_NATIVE = ["klient", "location", "kalkulant", "architekt", "datum_smluvni", "datum_objednavky", "prodejni_cena", "marze", "link_cn"];
const PM_NATIVE = ["pm", "status", "risk", "zamereni", "tpv_date", "expedice", "montaz", "predani", "pm_poznamka"];
const TPV_NATIVE = ["konstrukter", "narocnost", "hodiny_tpv", "percent_tpv", "tpv_poznamka"];

const ALL_EXTRA_COLUMNS: ColumnDef[] = [
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

function buildColumns(nativeKeys: string[]): ColumnDef[] {
  return [
    ...LOCKED,
    ...ALL_EXTRA_COLUMNS,
  ];
}

function buildDefaultHidden(nativeKeys: string[]): string[] {
  return ALL_EXTRA_COLUMNS
    .filter((c) => !nativeKeys.includes(c.key))
    .map((c) => c.key);
}

export const PROJECT_INFO_COLUMNS = buildColumns(PROJECT_INFO_NATIVE);
export const PM_COLUMNS = buildColumns(PM_NATIVE);
export const TPV_COLUMNS = buildColumns(TPV_NATIVE);

export const PROJECT_INFO_DEFAULT_HIDDEN = buildDefaultHidden(PROJECT_INFO_NATIVE);
export const PM_DEFAULT_HIDDEN = buildDefaultHidden(PM_NATIVE);
export const TPV_DEFAULT_HIDDEN = buildDefaultHidden(TPV_NATIVE);

// For the toggle UI, group columns by their native tab
export const COLUMN_GROUPS = [
  { label: "Project Info", keys: PROJECT_INFO_NATIVE },
  { label: "PM Status", keys: PM_NATIVE },
  { label: "TPV Status", keys: TPV_NATIVE },
];

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

const ColumnVisibilityCtx = createContext<ColumnVisibilityContextType | null>(null);

export function ColumnVisibilityProvider({ children }: { children: ReactNode }) {
  const projectInfo = useColumnVisibility("col-vis-project-info", PROJECT_INFO_COLUMNS, PROJECT_INFO_DEFAULT_HIDDEN);
  const pmStatus = useColumnVisibility("col-vis-pm-status", PM_COLUMNS, PM_DEFAULT_HIDDEN);
  const tpvStatus = useColumnVisibility("col-vis-tpv-status", TPV_COLUMNS, TPV_DEFAULT_HIDDEN);

  return (
    <ColumnVisibilityCtx.Provider value={{ projectInfo, pmStatus, tpvStatus }}>
      {children}
    </ColumnVisibilityCtx.Provider>
  );
}

export function useAllColumnVisibility() {
  const ctx = useContext(ColumnVisibilityCtx);
  if (!ctx) throw new Error("ColumnVisibilityProvider missing");
  return ctx;
}
