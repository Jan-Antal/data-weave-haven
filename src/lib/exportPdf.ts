import { format } from "date-fns";
import { cs } from "date-fns/locale";

export interface PdfExportOptions {
  tabLabel: string;
  headers: string[];
  rows: (string | number)[][];
  filterSummary?: string;
  statusColors?: Record<string, string>;
}

export function buildPrintableHtml({
  tabLabel,
  headers,
  rows,
  filterSummary,
  statusColors = {},
}: PdfExportOptions): string {
  const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });

  // Detect column types for alignment
  const isNumberCol = headers.map((_, i) =>
    rows.some((r) => typeof r[i] === "number" && r[i] !== 0)
  );

  const isStatusCol = headers.map((_, i) =>
    rows.some((r) => typeof r[i] === "string" && statusColors[String(r[i])])
  );

  // Format cell value
  function fmtCell(val: string | number, colIdx: number): string {
    if (val == null || val === "") return "";
    if (typeof val === "number") return val.toLocaleString("cs-CZ");
    const s = String(val);
    // Status badge
    if (isStatusCol[colIdx] && statusColors[s]) {
      const c = statusColors[s];
      return `<span class="badge" style="background:${c}20;color:${c};border:1px solid ${c}50;">${esc(s)}</span>`;
    }
    return esc(s);
  }

  function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const theadCells = headers
    .map((h, i) => `<th${isNumberCol[i] ? ' class="num"' : ""}>${esc(h)}</th>`)
    .join("");

  const tbodyRows = rows
    .map((row) => {
      const cells = row
        .map((cell, i) => `<td${isNumberCol[i] ? ' class="num"' : ""}>${fmtCell(cell, i)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>${esc(tabLabel)} — Export</title>
<style>
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    color: #1f2937;
    padding: 10mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { padding: 0; }
  }
  .header { margin-bottom: 6px; }
  .header h1 {
    font-size: 12pt;
    font-weight: 700;
    color: #2d3a2e;
    margin: 0;
  }
  .header .subtitle {
    font-size: 9pt;
    color: #6b7280;
    margin-top: 2px;
  }
  .header .filters {
    font-size: 7pt;
    color: #9ca3af;
    margin-top: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
    font-size: 8pt;
  }
  thead { display: table-header-group; }
  thead th {
    background: #2d3a2e;
    color: #fff;
    font-weight: 600;
    font-size: 8.5pt;
    padding: 4px 5px;
    text-align: left;
    border: 1px solid #2d3a2e;
    white-space: nowrap;
  }
  thead th.num { text-align: right; }
  tbody tr { break-inside: avoid; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td {
    padding: 3px 5px;
    border: 1px solid #e5e7eb;
    vertical-align: top;
    max-width: 200px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 500;
    white-space: nowrap;
  }
  @media print {
    .no-print { display: none !important; }
  }
  /* Page counter footer */
  @media print {
    @page { @bottom-center { content: counter(page) " z " counter(pages); } }
  }
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
  <tbody>
    ${tbodyRows}
  </tbody>
</table>
</body>
</html>`;
}
