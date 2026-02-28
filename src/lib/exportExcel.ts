import * as XLSX from "xlsx";
import { format } from "date-fns";
import { parseAppDate, formatAppDate } from "./dateFormat";
import { toast } from "@/hooks/use-toast";

interface ExportOptions {
  sheetName: string;
  fileName: string;
  headers: string[];
  rows: (string | number)[][];
}

export function exportToExcel({ sheetName, fileName, headers, rows }: ExportOptions) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Auto-width columns
  ws["!cols"] = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = row[i];
      const len = cell != null ? String(cell).length : 0;
      if (len > max) max = len;
    }
    return { wch: Math.min(max + 2, 50) };
  });

  // Auto-filter on header row
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);

  toast({
    title: "Exportováno",
    className: "bg-gray-100 text-gray-700 border border-gray-200 shadow-md",
  });
}

/** Extract a raw value from a project row for a given column key */
export function getProjectCellValue(project: Record<string, any>, key: string): string | number {
  const DATE_KEYS = new Set([
    "datum_smluvni", "datum_objednavky", "zamereni",
    "tpv_date", "expedice", "montaz", "predani",
  ]);

  if (key.startsWith("custom_")) {
    const cf = project.custom_fields || {};
    return cf[key] ?? "";
  }

  const val = project[key];

  if (val == null || val === "—") return "";

  if (key === "prodejni_cena") {
    if (val === "" || val == null) return "";
    const num = Number(val);
    const currency = project.currency || "CZK";
    const formatted = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
    return currency === "EUR" ? `${formatted} €` : `${formatted} Kč`;
  }

  if (key === "percent_tpv") {
    return val === "" || val == null ? "" : Number(val);
  }

  if (DATE_KEYS.has(key)) {
    const d = parseAppDate(String(val));
    return d ? formatAppDate(d) : String(val);
  }

  return String(val ?? "");
}

/** Build a file name like AMI-Project-Info-2026-02-26.xlsx */
export function buildFileName(tabLabel: string, projectId?: string): string {
  const date = format(new Date(), "yyyy-MM-dd");
  const sanitized = tabLabel.replace(/\s+/g, "-");
  if (projectId) return `AMI-TPV-${projectId}-${date}.xlsx`;
  return `AMI-${sanitized}-${date}.xlsx`;
}
