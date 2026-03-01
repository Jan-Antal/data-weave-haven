import React from "react";
import { TableCell } from "@/components/ui/table";
import { SortableHeader } from "./SortableHeader";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { formatCurrency, formatMarze, marzeInputToStorage, marzeStorageToInput } from "@/lib/currency";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import type { Project } from "@/hooks/useProjects";
import { ALL_COLUMNS } from "./ColumnVisibilityContext";
import type { CustomColumnDef } from "@/hooks/useCustomColumns";

// ── Shared layout constants for first 2 columns ────────────────────
export const COL_ICON_STYLE: React.CSSProperties = { width: 36, minWidth: 36, maxWidth: 36 };
export const COL_CHEVRON_STYLE: React.CSSProperties = { width: 36, minWidth: 36, maxWidth: 36 };

// ── Centralised column-width system ─────────────────────────────────
const DATE_KEYS = new Set([
  "datum_smluvni", "datum_objednavky", "zamereni",
  "tpv_date", "expedice", "montaz", "predani",
]);
const SHORT_KEYS = new Set(["marze", "risk", "percent_tpv", "narocnost"]);

// Max width caps for specific columns
const WIDTH_CAPS: Record<string, number> = {
  project_name: 180,
  pm_poznamka: 120,
  tpv_poznamka: 120,
  pm: 124,
  kalkulant: 124,
  architekt: 124,
};

const TRUNCATE_STYLE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function getColumnStyle(key: string, customWidth?: number | null): React.CSSProperties {
  const cap = WIDTH_CAPS[key];
  let w = customWidth ?? null;
  if (cap && w) w = Math.min(w, cap);

  if (w) {
    const base: React.CSSProperties = { width: w, minWidth: w };
    if (cap) return { ...base, maxWidth: cap, ...TRUNCATE_STYLE };
    return base;
  }
  if (key === "project_id") return { width: 110, minWidth: 110, maxWidth: 110 };
  if (key === "project_name") return { width: 180, minWidth: 180, maxWidth: 180, ...TRUNCATE_STYLE };
  if (key === "pm_poznamka") return { width: 120, minWidth: 120, maxWidth: 120, ...TRUNCATE_STYLE };
  if (key === "tpv_poznamka") return { width: 120, minWidth: 120, maxWidth: 120, ...TRUNCATE_STYLE };
  if (key === "pm") return { width: 124, minWidth: 124, maxWidth: 124, ...TRUNCATE_STYLE };
  if (key === "kalkulant") return { width: 124, minWidth: 124, maxWidth: 124, ...TRUNCATE_STYLE };
  if (key === "architekt") return { width: 124, minWidth: 124, maxWidth: 124, ...TRUNCATE_STYLE };
  if (DATE_KEYS.has(key)) return { width: 100, minWidth: 100, maxWidth: 100 };
  if (SHORT_KEYS.has(key)) return { width: 80, minWidth: 80, maxWidth: 80 };
  return { minWidth: 120 };
}

// ── Column label lookup ─────────────────────────────────────────────
const LABEL_MAP = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label]));
LABEL_MAP["project_id"] = "Project ID";
LABEL_MAP["project_name"] = "Project Name";

export function getColumnLabel(key: string, customColumns?: CustomColumnDef[]): string {
  if (key.startsWith("custom_") && customColumns) {
    const def = customColumns.find(c => c.column_key === key);
    if (def) return def.label;
  }
  // Fallback: strip "custom_TIMESTAMP_" prefix for a readable label
  if (key.startsWith("custom_")) {
    const parts = key.replace(/^custom_\d+_/, "");
    if (parts) return parts.charAt(0).toUpperCase() + parts.slice(1).replace(/_/g, " ");
  }
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
  customColumns?: CustomColumnDef[];
}

export function renderColumnHeader(props: HeaderProps) {
  const { colKey: key, sortCol, sortDir, onSort, getLabel, getWidth, editMode, updateLabel, updateWidth, dragProps, dropIndicator, isDragging, customColumns } = props;
  const defaultLabel = getColumnLabel(key, customColumns);
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
  save: (id: string, field: string, value: string, oldValue: string, projectId?: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  saveCurrency?: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
  customColumns?: CustomColumnDef[];
  saveCustomField?: (rowId: string, columnKey: string, value: string, oldValue: string) => void;
  isFieldReadOnly?: (field: string) => boolean;
}

export function renderColumnCell(props: CellProps) {
  const { colKey: key, project: p, save, canEdit, statusLabels, saveCurrency, customColumns, saveCustomField, isFieldReadOnly } = props;
  return renderCell(key, p, save, canEdit, statusLabels, saveCurrency, customColumns, saveCustomField, isFieldReadOnly);
}

function renderCell(
  key: string, p: Project,
  save: (id: string, f: string, v: string, o: string, projectId?: string) => void,
  canEdit: boolean, statusLabels: string[],
  saveCurrency?: (id: string, a: string, c: string, oa: string, oc: string) => void,
  customColumns?: CustomColumnDef[],
  saveCustomField?: (rowId: string, columnKey: string, value: string, oldValue: string) => void,
  isFieldReadOnly?: (field: string) => boolean,
) {
  const s = (field: string, val: string, old: string) => save(p.id, field, val, old, p.project_id);
  const v = (field: keyof Project) => (p as any)[field] ?? "";
  const ro = (field: string) => !canEdit || (isFieldReadOnly?.(field) ?? false);

  switch (key) {
    case "klient":
      return <TableCell key={key}><InlineEditableCell value={p.klient} onSave={(x) => s("klient", x, v("klient"))} readOnly={ro("klient")} /></TableCell>;
    case "location":
      return <TableCell key={key}><InlineEditableCell value={p.location} onSave={(x) => s("location", x, v("location"))} readOnly={ro("location")} /></TableCell>;
    case "kalkulant":
      return <TableCell key={key}><InlineEditableCell value={p.kalkulant} type="people" peopleRole="Kalkulant" onSave={(x) => s("kalkulant", x, v("kalkulant"))} readOnly={ro("kalkulant")} /></TableCell>;
    case "architekt":
      return <TableCell key={key}><InlineEditableCell value={p.architekt} onSave={(x) => s("architekt", x, v("architekt"))} readOnly={ro("architekt")} /></TableCell>;
    case "datum_smluvni":
      return <TableCell key={key}><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(x) => s("datum_smluvni", x, v("datum_smluvni"))} readOnly={ro("datum_smluvni")} /></TableCell>;
    case "datum_objednavky":
      return <TableCell key={key}><InlineEditableCell value={p.datum_objednavky} type="date" onSave={(x) => s("datum_objednavky", x, v("datum_objednavky"))} readOnly={ro("datum_objednavky")} /></TableCell>;
    case "prodejni_cena":
      if (saveCurrency && !ro("prodejni_cena")) {
        return <TableCell key={key} className="text-right"><CurrencyEditCell value={p.prodejni_cena} currency={p.currency || "CZK"} onSave={(a, c) => saveCurrency(p.id, a, c, String(p.prodejni_cena ?? ""), p.currency || "CZK")} /></TableCell>;
      }
      return <TableCell key={key} className="text-right"><span className="text-xs font-mono">{formatCurrency(p.prodejni_cena, p.currency || "CZK")}</span></TableCell>;
    case "marze":
      return <TableCell key={key} className="text-right"><InlineEditableCell value={marzeStorageToInput(p.marze)} onSave={(x) => s("marze", marzeInputToStorage(x) || "", v("marze"))} readOnly={ro("marze")} displayValue={<span className="text-xs font-mono">{formatMarze(p.marze)}</span>} /></TableCell>;
    case "pm":
      return <TableCell key={key}><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(x) => s("pm", x, v("pm"))} readOnly={ro("pm")} /></TableCell>;
    case "status":
      return <TableCell key={key}><InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(x) => s("status", x, v("status"))} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} readOnly={ro("status")} /></TableCell>;
    case "risk":
      return <TableCell key={key}><InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(x) => s("risk", x, v("risk"))} displayValue={<RiskBadge level={p.risk || ""} />} readOnly={ro("risk")} /></TableCell>;
    case "zamereni":
      return <TableCell key={key}><InlineEditableCell value={p.zamereni} type="date" onSave={(x) => s("zamereni", x, v("zamereni"))} readOnly={ro("zamereni")} /></TableCell>;
    case "tpv_date":
      return <TableCell key={key}><InlineEditableCell value={p.tpv_date} type="date" onSave={(x) => s("tpv_date", x, v("tpv_date"))} readOnly={ro("tpv_date")} /></TableCell>;
    case "expedice":
      return <TableCell key={key}><InlineEditableCell value={p.expedice} type="date" onSave={(x) => s("expedice", x, v("expedice"))} readOnly={ro("expedice")} /></TableCell>;
    case "montaz":
      return <TableCell key={key}><InlineEditableCell value={(p as any).montaz} type="date" onSave={(x) => s("montaz", x, (p as any).montaz || "")} readOnly={ro("montaz")} /></TableCell>;
    case "predani":
      return <TableCell key={key}><InlineEditableCell value={p.predani} type="date" onSave={(x) => s("predani", x, v("predani"))} readOnly={ro("predani")} /></TableCell>;
    case "pm_poznamka":
      return <TableCell key={key} style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.pm_poznamka || ""}><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(x) => s("pm_poznamka", x, v("pm_poznamka"))} readOnly={ro("pm_poznamka")} /></TableCell>;
    case "konstrukter":
      return <TableCell key={key}><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(x) => s("konstrukter", x, v("konstrukter"))} readOnly={ro("konstrukter")} /></TableCell>;
    case "narocnost":
      return <TableCell key={key}><InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(x) => s("narocnost", x, v("narocnost"))} displayValue={<RiskBadge level={p.narocnost || ""} />} readOnly={ro("narocnost")} /></TableCell>;
    case "hodiny_tpv":
      return <TableCell key={key}><InlineEditableCell value={p.hodiny_tpv} onSave={(x) => s("hodiny_tpv", x, v("hodiny_tpv"))} readOnly={ro("hodiny_tpv")} /></TableCell>;
    case "percent_tpv":
      return <TableCell key={key}><InlineEditableCell value={p.percent_tpv} type="number" onSave={(x) => s("percent_tpv", x, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} readOnly={ro("percent_tpv")} /></TableCell>;
    case "tpv_poznamka":
      return <TableCell key={key} style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.tpv_poznamka || ""}><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(x) => s("tpv_poznamka", x, v("tpv_poznamka"))} readOnly={ro("tpv_poznamka")} /></TableCell>;
    default: {
      if (key.startsWith("custom_") && customColumns && saveCustomField) {
        const def = customColumns.find(c => c.column_key === key);
        if (!def) return null;
        const customFields = (p as any).custom_fields || {};
        const val = customFields[key] || "";
        const cellType = def.data_type === "date" ? "date"
          : def.data_type === "number" ? "number"
          : def.data_type === "select" ? "select"
          : def.data_type === "people" ? "people"
          : undefined;
        return (
          <TableCell key={key}>
            <InlineEditableCell
              value={val}
              type={cellType as any}
              options={def.data_type === "select" ? def.select_options : undefined}
              peopleRole={def.data_type === "people" ? (def.people_role as any || undefined) : undefined}
              onSave={(x) => saveCustomField(p.id, key, x, val)}
              readOnly={ro(key)}
            />
          </TableCell>
        );
      }
      return null;
    }
  }
}
