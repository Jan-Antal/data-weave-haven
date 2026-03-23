import { format } from "date-fns";
import { cs } from "date-fns/locale";

export interface PdfExportOptions {
  tabLabel: string;
  headers: string[];
  rows: (string | number)[][];
  filterSummary?: string;
  statusColors?: Record<string, string>;
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
    font-family: 'Early Sans', system-ui, sans-serif;
    font-size: 8pt;
    color: #1f2937;
    padding: 6mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header { margin-bottom: 16px; }
  .header h1 { font-size: 18px; font-weight: 700; color: #2d3a2e; margin: 0 0 4px 0; }
  .header .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
  .header .filters { font-size: 10px; color: #9ca3af; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9pt; }
  thead th {
    background: #2d3a2e; color: #fff; font-weight: 600; font-size: 10pt;
    padding: 6px 8px; text-align: left; border: 1px solid #2d3a2e; white-space: nowrap;
  }
  thead th.num { text-align: right; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td {
    padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top;
    max-width: 220px; word-wrap: break-word; overflow-wrap: break-word;
  }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 500; white-space: nowrap; }
`;


export interface PruvodkaOptions {
  projectId: string;
  projectName: string;
  issuedBy: string;
  rows: {
    rowNum: number;
    kodPrvku: string;
    nazevPrvku: string;
    konstrukter: string;
    pocet: string | number;
    notes: string;
    isApproved: boolean;
  }[];
  hasUnapproved: boolean;
}

export function buildPruvodkaHtml(opts: PruvodkaOptions): string {
  const { projectId, projectName, issuedBy, rows, hasUnapproved } = opts;
  const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });

  const tableRows = rows.map(r => {
    const warnCell = hasUnapproved
      ? `<td style="text-align:center;color:#f59e0b;font-size:14pt;">${r.isApproved ? "" : "⚠"}</td>`
      : "";
    return `<tr${!r.isApproved ? ' style="background:#fffbeb;"' : ""}>
      ${warnCell}
      <td style="text-align:center;color:#6b7280;">${r.rowNum}</td>
      <td><strong>${esc(r.kodPrvku)}</strong></td>
      <td>${esc(r.nazevPrvku)}</td>
      <td>${esc(r.konstrukter)}</td>
      <td style="text-align:center;">${esc(String(r.pocet))}</td>
      <td>${esc(r.notes)}</td>
    </tr>`;
  }).join("\n");

  const warnHeader = hasUnapproved ? `<th style="width:24px;"></th>` : "";

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>Průvodka — ${esc(projectId)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; font-size: 9pt; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1a3330;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .logo-area { display: flex; flex-direction: column; }
  .logo { font-size: 22pt; font-weight: 800; color: #1a3330; letter-spacing: -0.5px; }
  .logo span { color: #ea580c; }
  .claim { font-size: 7pt; color: #6b7280; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 2px; }

  .doc-title { text-align: center; }
  .doc-title h1 { font-size: 13pt; font-weight: 700; color: #1a3330; }
  .doc-title .sub { font-size: 8pt; color: #6b7280; margin-top: 3px; }

  .meta-row {
    display: flex;
    gap: 24px;
    margin-bottom: 10px;
    font-size: 8.5pt;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 6px 10px;
    background: #f9fafb;
  }
  .meta-row .field { display: flex; flex-direction: column; gap: 1px; }
  .meta-row .label { font-size: 7pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-row .value { font-weight: 600; color: #1f2937; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead th {
    background: #1a3330; color: #fff; font-weight: 600;
    padding: 5px 7px; text-align: left; border: 1px solid #1a3330;
  }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 4px 7px; border: 1px solid #e5e7eb; vertical-align: top; }

  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; }

  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style>
</head>
<body>
<div class="page-header">
  <div class="logo-area">
    <div class="logo">A<span>→</span>M Interior</div>
    <div class="claim">From "A" to Masterpiece</div>
  </div>
  <div class="doc-title">
    <h1>Seznam výkresové dokumentace</h1>
    <div class="sub">Průvodka do výroby</div>
  </div>
</div>
<div class="meta-row">
  <div class="field"><div class="label">Číslo zakázky</div><div class="value">${esc(projectId)}</div></div>
  <div class="field"><div class="label">Název zakázky</div><div class="value">${esc(projectName)}</div></div>
  <div class="field"><div class="label">Termín vydání</div><div class="value">${dateStr}</div></div>
  <div class="field"><div class="label">Vydal</div><div class="value">${esc(issuedBy)}</div></div>
</div>
<table>
  <thead><tr>
    ${warnHeader}
    <th style="width:30px;text-align:center;">#</th>
    <th>Kód prvku</th>
    <th>Název prvku</th>
    <th>Konstruktér</th>
    <th style="text-align:center;">Počet</th>
    <th>Poznámka</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;
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
