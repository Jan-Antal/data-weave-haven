import React from "react";
import { TableCell } from "@/components/ui/table";
import { SortableHeader } from "./SortableHeader";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import type { Project } from "@/hooks/useProjects";

// All column keys across all tabs (excluding project_id, project_name which are always handled natively)
export const ALL_COLUMN_KEYS = [
  "klient", "location", "kalkulant", "architekt", "datum_smluvni", "datum_objednavky",
  "prodejni_cena", "marze", "link_cn",
  "pm", "status", "risk", "zamereni", "tpv_date", "expedice", "montaz", "predani", "pm_poznamka",
  "konstrukter", "narocnost", "hodiny_tpv", "percent_tpv", "tpv_poznamka",
];

interface ColumnMeta {
  label: string;
  style?: React.CSSProperties;
}

const COLUMN_META: Record<string, ColumnMeta> = {
  klient: { label: "Klient", style: { minWidth: 100 } },
  location: { label: "Lokace", style: { minWidth: 100 } },
  kalkulant: { label: "Kalkulant", style: { minWidth: 110 } },
  architekt: { label: "Architekt", style: { minWidth: 110 } },
  datum_smluvni: { label: "Datum Smluvní", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  datum_objednavky: { label: "Datum Objednávky", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  prodejni_cena: { label: "Prodejní cena", style: { width: 120, minWidth: 110 } },
  marze: { label: "Marže", style: { width: 70, minWidth: 60 } },
  link_cn: { label: "CN", style: { minWidth: 120 } },
  pm: { label: "PM", style: { minWidth: 110 } },
  status: { label: "Status", style: { width: 110, minWidth: 100 } },
  risk: { label: "Risk", style: { width: 80, minWidth: 75 } },
  zamereni: { label: "Zaměření", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  tpv_date: { label: "TPV", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  expedice: { label: "Expedice", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  montaz: { label: "Montáž", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  predani: { label: "Předání", style: { width: 100, minWidth: 100, maxWidth: 100 } },
  pm_poznamka: { label: "Poznámka PM", style: { minWidth: 140 } },
  konstrukter: { label: "Konstruktér", style: { minWidth: 110 } },
  narocnost: { label: "Náročnost", style: { width: 90, minWidth: 85 } },
  hodiny_tpv: { label: "Hodiny TPV", style: { width: 90, minWidth: 85 } },
  percent_tpv: { label: "% Rozpracovanost", style: { width: 110, minWidth: 100 } },
  tpv_poznamka: { label: "Poznámka TPV", style: { minWidth: 140 } },
};

interface CrossTabHeadersProps {
  nativeKeys: string[];
  isVisible: (key: string) => boolean;
  sortCol: string | null;
  sortDir: "asc" | "desc" | null;
  onSort: (col: string) => void;
  getLabel: (key: string, def: string) => string;
  getWidth: (key: string) => number | undefined;
  editMode: boolean;
  updateLabel: (key: string, label: string) => void;
  updateWidth: (key: string, width: number) => void;
}

export function renderCrossTabHeaders({
  nativeKeys,
  isVisible,
  sortCol, sortDir, onSort,
  getLabel, getWidth, editMode, updateLabel, updateWidth,
}: CrossTabHeadersProps) {
  const crossKeys = ALL_COLUMN_KEYS.filter(k => !nativeKeys.includes(k) && isVisible(k));
  
  return crossKeys.map(key => {
    const meta = COLUMN_META[key];
    if (!meta) return null;
    const w = getWidth(key);
    const baseStyle = meta.style || {};
    const style = w ? { ...baseStyle, width: w, minWidth: w } : baseStyle;
    
    return (
      <SortableHeader
        key={key}
        label={meta.label}
        column={key}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={onSort}
        style={style}
        editMode={editMode}
        customLabel={getLabel(key, meta.label)}
        onLabelChange={(newLabel: string) => updateLabel(key, newLabel)}
        onWidthChange={(newWidth: number) => updateWidth(key, newWidth)}
        className={key === "prodejni_cena" || key === "marze" ? "text-right" : ""}
      />
    );
  });
}

interface CrossTabCellsProps {
  nativeKeys: string[];
  isVisible: (key: string) => boolean;
  project: Project;
  save: (id: string, field: string, value: string, oldValue: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  saveCurrency?: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
}

export function renderCrossTabCells({
  nativeKeys,
  isVisible,
  project: p,
  save,
  canEdit,
  statusLabels,
  saveCurrency,
}: CrossTabCellsProps) {
  const crossKeys = ALL_COLUMN_KEYS.filter(k => !nativeKeys.includes(k) && isVisible(k));
  
  return crossKeys.map(key => {
    switch (key) {
      case "klient":
        return <TableCell key={key}><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} readOnly={!canEdit} /></TableCell>;
      case "location":
        return <TableCell key={key}><InlineEditableCell value={p.location} onSave={(val) => save(p.id, "location", val, p.location || "")} readOnly={!canEdit} /></TableCell>;
      case "kalkulant":
        return <TableCell key={key}><InlineEditableCell value={p.kalkulant} type="people" peopleRole="Kalkulant" onSave={(val) => save(p.id, "kalkulant", val, p.kalkulant || "")} readOnly={!canEdit} /></TableCell>;
      case "architekt":
        return <TableCell key={key}><InlineEditableCell value={p.architekt} onSave={(val) => save(p.id, "architekt", val, p.architekt || "")} readOnly={!canEdit} /></TableCell>;
      case "datum_smluvni":
        return <TableCell key={key}><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(val) => save(p.id, "datum_smluvni", val, p.datum_smluvni || "")} readOnly={!canEdit} /></TableCell>;
      case "datum_objednavky":
        return <TableCell key={key}><InlineEditableCell value={p.datum_objednavky} type="date" onSave={(val) => save(p.id, "datum_objednavky", val, p.datum_objednavky || "")} readOnly={!canEdit} /></TableCell>;
      case "prodejni_cena":
        if (saveCurrency) {
          return <TableCell key={key} className="text-right"><CurrencyEditCell value={p.prodejni_cena} currency={p.currency || "CZK"} onSave={(amount, currency) => saveCurrency(p.id, amount, currency, String(p.prodejni_cena ?? ""), p.currency || "CZK")} /></TableCell>;
        }
        return <TableCell key={key} className="text-right"><InlineEditableCell value={String(p.prodejni_cena ?? "")} onSave={(val) => save(p.id, "prodejni_cena", val, String(p.prodejni_cena ?? ""))} readOnly={!canEdit} /></TableCell>;
      case "marze":
        return <TableCell key={key} className="text-right"><InlineEditableCell value={p.marze} onSave={(val) => save(p.id, "marze", val, p.marze || "")} readOnly={!canEdit} /></TableCell>;
      case "link_cn":
        return <TableCell key={key}><InlineEditableCell value={p.link_cn} onSave={(val) => save(p.id, "link_cn", val, p.link_cn || "")} readOnly={!canEdit} /></TableCell>;
      case "pm":
        return <TableCell key={key}><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} readOnly={!canEdit} /></TableCell>;
      case "status":
        return <TableCell key={key}><InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} readOnly={!canEdit} /></TableCell>;
      case "risk":
        return <TableCell key={key}><InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "risk", val, p.risk || "")} displayValue={<RiskBadge level={p.risk || ""} />} readOnly={!canEdit} /></TableCell>;
      case "zamereni":
        return <TableCell key={key}><InlineEditableCell value={p.zamereni} type="date" onSave={(val) => save(p.id, "zamereni", val, p.zamereni || "")} readOnly={!canEdit} /></TableCell>;
      case "tpv_date":
        return <TableCell key={key}><InlineEditableCell value={p.tpv_date} type="date" onSave={(val) => save(p.id, "tpv_date", val, p.tpv_date || "")} readOnly={!canEdit} /></TableCell>;
      case "expedice":
        return <TableCell key={key}><InlineEditableCell value={p.expedice} type="date" onSave={(val) => save(p.id, "expedice", val, p.expedice || "")} readOnly={!canEdit} /></TableCell>;
      case "montaz":
        return <TableCell key={key}><InlineEditableCell value={(p as any).montaz} type="date" onSave={(val) => save(p.id, "montaz", val, (p as any).montaz || "")} readOnly={!canEdit} /></TableCell>;
      case "predani":
        return <TableCell key={key}><InlineEditableCell value={p.predani} type="date" onSave={(val) => save(p.id, "predani", val, p.predani || "")} readOnly={!canEdit} /></TableCell>;
      case "pm_poznamka":
        return <TableCell key={key}><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(val) => save(p.id, "pm_poznamka", val, p.pm_poznamka || "")} readOnly={!canEdit} /></TableCell>;
      case "konstrukter":
        return <TableCell key={key}><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(val) => save(p.id, "konstrukter", val, p.konstrukter || "")} readOnly={!canEdit} /></TableCell>;
      case "narocnost":
        return <TableCell key={key}><InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "narocnost", val, p.narocnost || "")} displayValue={<RiskBadge level={p.narocnost || ""} />} readOnly={!canEdit} /></TableCell>;
      case "hodiny_tpv":
        return <TableCell key={key}><InlineEditableCell value={p.hodiny_tpv} onSave={(val) => save(p.id, "hodiny_tpv", val, p.hodiny_tpv || "")} readOnly={!canEdit} /></TableCell>;
      case "percent_tpv":
        return <TableCell key={key}><InlineEditableCell value={p.percent_tpv} type="number" onSave={(val) => save(p.id, "percent_tpv", val, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} readOnly={!canEdit} /></TableCell>;
      case "tpv_poznamka":
        return <TableCell key={key}><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(val) => save(p.id, "tpv_poznamka", val, p.tpv_poznamka || "")} readOnly={!canEdit} /></TableCell>;
      default:
        return null;
    }
  });
}
