/**
 * AuditTrail — generic timeline view of changes.
 *
 * Lives in shared/ so it can be used by any TPV tab. Tab-specific
 * status label translations (e.g. "navrh" → "Návrh") are passed in
 * via the optional `valueFormatter` prop.
 */

import { useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Loader2,
  History,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { formatDateLong, relativeTime } from "../helpers";
import type { TpvAuditLogRow, AuditAction } from "../types";

// ============================================================
// LABELS / CONFIG
// ============================================================

const ACTION_ICON: Record<
  AuditAction,
  React.ComponentType<{ className?: string }>
> = {
  INSERT: Plus,
  UPDATE: Edit3,
  DELETE: Trash2,
};

const ACTION_COLOR: Record<AuditAction, string> = {
  INSERT: "bg-green-100 text-green-700 border-green-200",
  UPDATE: "bg-blue-100 text-blue-700 border-blue-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
};

const TABLE_LABELS: Record<string, string> = {
  tpv_subcontract: "Subdodávka",
  tpv_subcontract_request: "RFQ ponuka",
  tpv_supplier: "Dodávateľ",
  tpv_supplier_contact: "Kontakt",
  tpv_supplier_pricelist: "Cenníková položka",
  tpv_supplier_task: "Úloha",
  tpv_material: "Materiál",
  tpv_hours_allocation: "Hodiny",
  tpv_preparation: "Príprava",
  tpv_project_preparation: "Príprava projektu",
};

const FIELD_LABELS: Record<string, string> = {
  // Common
  stav: "Stav",
  status: "Stav",
  nazov: "Názov",
  popis: "Popis",
  poznamka: "Poznámka",
  notes: "Poznámky",
  is_active: "Aktívny",
  // Subcontract
  dodavatel_id: "Dodávateľ",
  cena_predpokladana: "Plánovaná cena",
  cena_finalna: "Finálna cena",
  cena_nabidka: "Cena ponuky",
  objednane_dat: "Dátum objednávky",
  dodane_dat: "Dátum návratu",
  termin_dodani: "Termín dodania",
  mnozstvo: "Množstvo",
  jednotka: "Jednotka",
  // Supplier
  rating: "Rating",
  ico: "IČO",
  dic: "DIČ",
  adresa: "Adresa",
  kategorie: "Kategórie",
  // Hours
  hodiny_navrh: "Hodiny — návrh",
  approved_by: "Schválil",
  // Common UUIDs (often shown as "—" by formatter)
  assigned_to: "Pridelené",
  created_by: "Vytvoril",
};

function formatFieldName(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * Default formatter for field values — handles booleans, arrays, money,
 * dates, abbreviated UUIDs. Tab-specific status enums should be handled
 * by the caller via the optional `valueFormatter` prop.
 */
function defaultFormatFieldValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";

  if (typeof value === "boolean") return value ? "Áno" : "Nie";

  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";

  if (
    typeof value === "number" &&
    (key.includes("cena") || key.includes("rating") || key === "mnozstvo")
  ) {
    return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(
      value
    );
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDateLong(value);
  }

  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) {
    return value.slice(0, 8) + "…";
  }

  return String(value);
}

// ============================================================
// COMPONENT
// ============================================================

export interface AuditTrailProps {
  entries: TpvAuditLogRow[];
  isLoading?: boolean;
  emptyMessage?: string;
  /**
   * Optional override for formatting a single field's value. Receives
   * (fieldKey, rawValue) and returns either a formatted string OR
   * undefined to fall back to the default formatter. Use this to
   * translate tab-specific status enums.
   *
   * Example:
   *   valueFormatter={(key, val) => key === "stav"
   *     ? STAV_LABELS[val as SubcontractStav] ?? String(val)
   *     : undefined}
   */
  valueFormatter?: (key: string, value: unknown) => string | undefined;
}

export function AuditTrail({
  entries,
  isLoading,
  emptyMessage = "Žiadne záznamy histórie.",
  valueFormatter,
}: AuditTrailProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Načítavam históriu…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const formatValue = (key: string, value: unknown): string => {
    if (valueFormatter) {
      const custom = valueFormatter(key, value);
      if (custom !== undefined) return custom;
    }
    return defaultFormatFieldValue(key, value);
  };

  return (
    <ol className="relative border-l-2 border-muted pl-5 space-y-4">
      {entries.map((entry) => (
        <AuditEntry key={entry.id} entry={entry} formatValue={formatValue} />
      ))}
    </ol>
  );
}

function AuditEntry({
  entry,
  formatValue,
}: {
  entry: TpvAuditLogRow;
  formatValue: (key: string, value: unknown) => string;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const Icon = ACTION_ICON[entry.action];

  const hasDiff =
    entry.action === "UPDATE" &&
    entry.changed_fields &&
    entry.changed_fields.length > 0;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[33px] flex items-center justify-center w-6 h-6 rounded-full border-2 bg-background",
          ACTION_COLOR[entry.action]
        )}
      >
        <Icon className="h-3 w-3" />
      </span>

      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] uppercase">
              {TABLE_LABELS[entry.table_name] ?? entry.table_name}
            </Badge>
            <span className="text-sm font-medium">
              {entry.summary ?? entry.action}
            </span>
          </div>
          <span
            className="text-xs text-muted-foreground whitespace-nowrap"
            title={formatDateLong(entry.created_at)}
          >
            {relativeTime(entry.created_at)}
          </span>
        </div>

        {(entry.actor_name || entry.actor_email) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{entry.actor_name || entry.actor_email}</span>
          </div>
        )}

        {hasDiff && (
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showDiff ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {entry.changed_fields?.length} zmenených polí
          </button>
        )}

        {showDiff && entry.changed_fields && (
          <div className="mt-2 rounded-md border bg-muted/30 divide-y text-xs">
            {entry.changed_fields.map((field) => {
              const oldVal = entry.old_values?.[field];
              const newVal = entry.new_values?.[field];
              return (
                <div
                  key={field}
                  className="grid grid-cols-[120px_1fr_1fr] gap-2 px-3 py-1.5"
                >
                  <span className="text-muted-foreground font-medium">
                    {formatFieldName(field)}
                  </span>
                  <span className="line-through text-red-700/70 truncate">
                    {formatValue(field, oldVal)}
                  </span>
                  <span className="text-green-700 font-medium truncate">
                    {formatValue(field, newVal)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
