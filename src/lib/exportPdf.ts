import { format } from "date-fns";
import { cs } from "date-fns/locale";

export interface PdfExportOptions {
  tabLabel: string;
  headers: string[];
  rows: (string | number)[][];
  filterSummary?: string;
  statusColors?: Record<string, string>;
}

interface PageBuildOptions extends PdfExportOptions {
  pageNum: number;
  totalPages: number;
  showTitle: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getColumnMeta(headers: string[], rows: (string | number)[][], statusColors: Record<string, string>) {
  const isNumberCol = headers.map((_, i) =>
    rows.some((r) => typeof r[i] === "number" && r[i] !== 0)
  );
  const isStatusCol = headers.map((_, i) =>
    rows.some((r) => typeof r[i] === "string" && statusColors[String(r[i])])
  );
  return { isNumberCol, isStatusCol };
}

function fmtCell(val: string | number, colIdx: number, isStatusCol: boolean[], isNumberCol: boolean[], statusColors: Record<string, string>): string {
  if (val == null || val === "") return "";
  if (typeof val === "number") return val.toLocaleString("cs-CZ");
  const s = String(val);
  if (isStatusCol[colIdx] && statusColors[s]) {
    const c = statusColors[s];
    return `<span class="badge" style="background:${c}20;color:${c};border:1px solid ${c}50;">${esc(s)}</span>`;
  }
  return esc(s);
}

function buildTheadCells(headers: string[], isNumberCol: boolean[]): string {
  return headers.map((h, i) => `<th${isNumberCol[i] ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
}

function buildTbodyRows(rows: (string | number)[][], isNumberCol: boolean[], isStatusCol: boolean[], statusColors: Record<string, string>): string {
  return rows
    .map((row) => {
      const cells = row.map((cell, i) => `<td${isNumberCol[i] ? ' class="num"' : ""}>${fmtCell(cell, i, isStatusCol, isNumberCol, statusColors)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");
}

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    color: #1f2937;
    padding: 6mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header { margin-bottom: 6px; }
  .header h1 { font-size: 12pt; font-weight: 700; color: #2d3a2e; margin: 0; }
  .header .subtitle { font-size: 9pt; color: #6b7280; margin-top: 2px; }
  .header .filters { font-size: 7pt; color: #9ca3af; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8pt; }
  thead th {
    background: #2d3a2e; color: #fff; font-weight: 600; font-size: 8.5pt;
    padding: 4px 5px; text-align: left; border: 1px solid #2d3a2e; white-space: nowrap;
  }
  thead th.num { text-align: right; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td {
    padding: 3px 5px; border: 1px solid #e5e7eb; vertical-align: top;
    max-width: 200px; word-wrap: break-word; overflow-wrap: break-word;
  }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 500; white-space: nowrap; }
  .page-footer { margin-top: 6px; text-align: right; font-size: 7pt; color: #9ca3af; }
`;

/** Build HTML for a single PDF page (used by paginated renderer) */
export function buildPageHtml({
  tabLabel,
  headers,
  rows,
  filterSummary,
  statusColors = {},
  pageNum,
  totalPages,
  showTitle,
}: PageBuildOptions): string {
  const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });
  const { isNumberCol, isStatusCol } = getColumnMeta(headers, rows, statusColors);
  const theadCells = buildTheadCells(headers, isNumberCol);
  const tbodyRows = buildTbodyRows(rows, isNumberCol, isStatusCol, statusColors);

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head><body>
${showTitle ? `<div class="header">
  <h1>A→M Interior | Project Info 2026</h1>
  <div class="subtitle">${esc(tabLabel)} — ${esc(dateStr)}</div>
  ${filterSummary ? `<div class="filters">Filtry: ${esc(filterSummary)}</div>` : ""}
</div>` : ""}
<table><thead><tr>${theadCells}</tr></thead><tbody>${tbodyRows}</tbody></table>
<div class="page-footer">Strana ${pageNum} z ${totalPages}</div>
</body></html>`;
}

/** Build full preview HTML (single document for iframe preview) */
export function buildPrintableHtml({
  tabLabel,
  headers,
  rows,
  filterSummary,
  statusColors = {},
}: PdfExportOptions): string {
  const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });
  const { isNumberCol, isStatusCol } = getColumnMeta(headers, rows, statusColors);
  const theadCells = buildTheadCells(headers, isNumberCol);
  const tbodyRows = buildTbodyRows(rows, isNumberCol, isStatusCol, statusColors);

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>${esc(tabLabel)} — Export</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  ${BASE_STYLES}
  @media print { body { padding: 0; } }
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="header">
  <h1>A→M Interior | Project Info 2026</h1>
  <div class="subtitle">${esc(tabLabel)} — ${esc(dateStr)}</div>
  ${filterSummary ? `<div class="filters">Filtry: ${esc(filterSummary)}</div>` : ""}
</div>
<table>
  <thead><tr>${theadCells}</tr></thead>
  <tbody>${tbodyRows}</tbody>
</table>
</body>
</html>`;
}
