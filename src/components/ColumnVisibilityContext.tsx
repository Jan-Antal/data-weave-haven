import { createContext, useContext, ReactNode } from "react";
import { useColumnVisibility, ColumnDef } from "@/hooks/useColumnVisibility";

export const PROJECT_INFO_COLUMNS: ColumnDef[] = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "klient", label: "Klient" },
  { key: "location", label: "Lokace" },
  { key: "kalkulant", label: "Kalkulant" },
  { key: "architekt", label: "Architekt" },
  { key: "datum_smluvni", label: "Datum Smluvní" },
  { key: "datum_objednavky", label: "Datum Objednávky" },
  { key: "prodejni_cena", label: "Prodejní cena" },
  { key: "marze", label: "Marže" },
  { key: "link_cn", label: "CN" },
];

export const PM_COLUMNS: ColumnDef[] = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "pm", label: "PM" },
  { key: "status", label: "Status" },
  { key: "risk", label: "Risk" },
  { key: "zamereni", label: "Zaměření" },
  { key: "tpv_date", label: "TPV" },
  { key: "expedice", label: "Expedice" },
  { key: "montaz", label: "Montáž" },
  { key: "predani", label: "Předání" },
  { key: "pm_poznamka", label: "Poznámka PM" },
];

export const TPV_COLUMNS: ColumnDef[] = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "narocnost", label: "Náročnost" },
  { key: "hodiny_tpv", label: "Hodiny TPV" },
  { key: "percent_tpv", label: "% Rozpracovanost" },
  { key: "tpv_poznamka", label: "Poznámka TPV" },
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
  const projectInfo = useColumnVisibility("col-vis-project-info", PROJECT_INFO_COLUMNS);
  const pmStatus = useColumnVisibility("col-vis-pm-status", PM_COLUMNS);
  const tpvStatus = useColumnVisibility("col-vis-tpv-status", TPV_COLUMNS);

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
