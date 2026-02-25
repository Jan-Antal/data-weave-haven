import React from "react";
import { TableCell } from "@/components/ui/table";
import { SortableHeader } from "./SortableHeader";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import type { Project } from "@/hooks/useProjects";
import { ALL_COLUMNS } from "./ColumnVisibilityContext";

// ── Centralised column-width system ─────────────────────────────────
const DATE_KEYS = new Set([
  "datum_smluvni", "datum_objednavky", "zamereni",
  "tpv_date", "expedice", "montaz", "predani",
]);
const SHORT_KEYS = new Set(["marze", "link_cn", "risk", "percent_tpv", "narocnost"]);

export function getColumnStyle(key: string, customWidth?: number | null): React.CSSProperties {
  if (customWidth) return { width: customWidth, minWidth: customWidth };
  if (key === "project_id") return { width: 110, minWidth: 110, maxWidth: 110 };
  if (key === "project_name") return { width: 180, minWidth: 180 };
  if (key === "pm_poznamka") return { width: 120, minWidth: 120 };
  if (key === "tpv_poznamka") return { width: 120, minWidth: 120 };
  if (DATE_KEYS.has(key)) return { width: 100, minWidth: 100, maxWidth: 100 };
  if (SHORT_KEYS.has(key)) return { width: 80, minWidth: 80, maxWidth: 80 };
  return { minWidth: 120 };
}

// ── Column label lookup ─────────────────────────────────────────────
const LABEL_MAP = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label]));
LABEL_MAP["project_id"] = "Project ID";
LABEL_MAP["project_name"] = "Project Name";

export function getColumnLabel(key: string): string {
  return LABEL_MAP[key] ?? key;
}

// ── Render a single header by key ───────────────────────────────────
interface HeaderProps {
  colKey: string;
  sortCol: string | null;
  sortDir: "asc" | "desc" | null;
  onSort: (col: string) => void;
  getLabel: (key: string, def: string) => string;
  getWidth: (key: string) => number | null;
  editMode: boolean;
  updateLabel: (key: string, label: string) => void;
  updateWidth: (key: string, width: number) => void;
  dragProps?: Record<string, any>;
  dropIndicator?: "left" | "right" | null;
  isDragging?: boolean;
}

export function renderColumnHeader(props: HeaderProps) {
  const { colKey: key, sortCol, sortDir, onSort, getLabel, getWidth, editMode, updateLabel, updateWidth, dragProps, dropIndicator, isDragging } = props;
  const defaultLabel = getColumnLabel(key);
  const style = getColumnStyle(key, getWidth(key));
  const isRight = key === "prodejni_cena" || key === "marze";
  return (
    <SortableHeader
      key={key}
      label={defaultLabel}
      column={key}
      sortCol={sortCol}
      sortDir={sortDir}
      onSort={onSort}
      style={style}
      className={isRight ? "text-right" : ""}
      editMode={editMode}
      customLabel={getLabel(key, defaultLabel)}
      onLabelChange={(v: string) => updateLabel(key, v)}
      onWidthChange={(w: number) => updateWidth(key, w)}
      dragProps={dragProps}
      dropIndicator={dropIndicator}
      isDragging={isDragging}
    />
  );
}

// ── Render a single cell by key ─────────────────────────────────────
interface CellProps {
  colKey: string;
  project: Project;
  save: (id: string, field: string, value: string, oldValue: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  saveCurrency?: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
}

export function renderColumnCell(props: CellProps) {
  const { colKey: key, project: p, save, canEdit, statusLabels, saveCurrency } = props;
  return renderCell(key, p, save, canEdit, statusLabels, saveCurrency);
}

function renderCell(
  key: string, p: Project,
  save: (id: string, f: string, v: string, o: string) => void,
  canEdit: boolean, statusLabels: string[],
  saveCurrency?: (id: string, a: string, c: string, oa: string, oc: string) => void,
) {
  const s = (field: string, val: string, old: string) => save(p.id, field, val, old);
  const v = (field: keyof Project) => (p as any)[field] ?? "";

  switch (key) {
    case "klient":
      return <TableCell key={key}><InlineEditableCell value={p.klient} onSave={(x) => s("klient", x, v("klient"))} readOnly={!canEdit} /></TableCell>;
    case "location":
      return <TableCell key={key}><InlineEditableCell value={p.location} onSave={(x) => s("location", x, v("location"))} readOnly={!canEdit} /></TableCell>;
    case "kalkulant":
      return <TableCell key={key}><InlineEditableCell value={p.kalkulant} type="people" peopleRole="Kalkulant" onSave={(x) => s("kalkulant", x, v("kalkulant"))} readOnly={!canEdit} /></TableCell>;
    case "architekt":
      return <TableCell key={key}><InlineEditableCell value={p.architekt} onSave={(x) => s("architekt", x, v("architekt"))} readOnly={!canEdit} /></TableCell>;
    case "datum_smluvni":
      return <TableCell key={key}><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(x) => s("datum_smluvni", x, v("datum_smluvni"))} readOnly={!canEdit} /></TableCell>;
    case "datum_objednavky":
      return <TableCell key={key}><InlineEditableCell value={p.datum_objednavky} type="date" onSave={(x) => s("datum_objednavky", x, v("datum_objednavky"))} readOnly={!canEdit} /></TableCell>;
    case "prodejni_cena":
      if (saveCurrency) {
        return <TableCell key={key} className="text-right"><CurrencyEditCell value={p.prodejni_cena} currency={p.currency || "CZK"} onSave={(a, c) => saveCurrency(p.id, a, c, String(p.prodejni_cena ?? ""), p.currency || "CZK")} /></TableCell>;
      }
      return <TableCell key={key} className="text-right"><InlineEditableCell value={String(p.prodejni_cena ?? "")} onSave={(x) => s("prodejni_cena", x, String(p.prodejni_cena ?? ""))} readOnly={!canEdit} /></TableCell>;
    case "marze":
      return <TableCell key={key} className="text-right"><InlineEditableCell value={p.marze} onSave={(x) => s("marze", x, v("marze"))} readOnly={!canEdit} /></TableCell>;
    case "link_cn":
      return <TableCell key={key}><InlineEditableCell value={p.link_cn} onSave={(x) => s("link_cn", x, v("link_cn"))} readOnly={!canEdit} /></TableCell>;
    case "pm":
      return <TableCell key={key}><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(x) => s("pm", x, v("pm"))} readOnly={!canEdit} /></TableCell>;
    case "status":
      return <TableCell key={key}><InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(x) => s("status", x, v("status"))} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} readOnly={!canEdit} /></TableCell>;
    case "risk":
      return <TableCell key={key}><InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(x) => s("risk", x, v("risk"))} displayValue={<RiskBadge level={p.risk || ""} />} readOnly={!canEdit} /></TableCell>;
    case "zamereni":
      return <TableCell key={key}><InlineEditableCell value={p.zamereni} type="date" onSave={(x) => s("zamereni", x, v("zamereni"))} readOnly={!canEdit} /></TableCell>;
    case "tpv_date":
      return <TableCell key={key}><InlineEditableCell value={p.tpv_date} type="date" onSave={(x) => s("tpv_date", x, v("tpv_date"))} readOnly={!canEdit} /></TableCell>;
    case "expedice":
      return <TableCell key={key}><InlineEditableCell value={p.expedice} type="date" onSave={(x) => s("expedice", x, v("expedice"))} readOnly={!canEdit} /></TableCell>;
    case "montaz":
      return <TableCell key={key}><InlineEditableCell value={(p as any).montaz} type="date" onSave={(x) => s("montaz", x, (p as any).montaz || "")} readOnly={!canEdit} /></TableCell>;
    case "predani":
      return <TableCell key={key}><InlineEditableCell value={p.predani} type="date" onSave={(x) => s("predani", x, v("predani"))} readOnly={!canEdit} /></TableCell>;
    case "pm_poznamka":
      return <TableCell key={key}><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(x) => s("pm_poznamka", x, v("pm_poznamka"))} readOnly={!canEdit} /></TableCell>;
    case "konstrukter":
      return <TableCell key={key}><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(x) => s("konstrukter", x, v("konstrukter"))} readOnly={!canEdit} /></TableCell>;
    case "narocnost":
      return <TableCell key={key}><InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(x) => s("narocnost", x, v("narocnost"))} displayValue={<RiskBadge level={p.narocnost || ""} />} readOnly={!canEdit} /></TableCell>;
    case "hodiny_tpv":
      return <TableCell key={key}><InlineEditableCell value={p.hodiny_tpv} onSave={(x) => s("hodiny_tpv", x, v("hodiny_tpv"))} readOnly={!canEdit} /></TableCell>;
    case "percent_tpv":
      return <TableCell key={key}><InlineEditableCell value={p.percent_tpv} type="number" onSave={(x) => s("percent_tpv", x, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} readOnly={!canEdit} /></TableCell>;
    case "tpv_poznamka":
      return <TableCell key={key}><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(x) => s("tpv_poznamka", x, v("tpv_poznamka"))} readOnly={!canEdit} /></TableCell>;
    default:
      return null;
  }
}
