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
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

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

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 357 42" width="180" height="22"><svg x="0" y="0" width="140" height="42" viewBox="50 40 140 42"><path fill="#EA592A" d="M83.28,79.84h5.99l-15.1-39.73h-6.41l-15.16,39.73h5.69l3.89-10.55h17.23l3.87,10.55ZM63.93,64.56l4.25-11.51c.68-1.96,1.29-3.8,1.83-5.51.29-.94.56-1.84.8-2.72.27.94.56,1.93.88,2.99.58,1.9,1.17,3.65,1.77,5.24l4.22,11.51h-13.74Z"/><polygon fill="#EA592A" points="114.33 42.98 108.4 42.98 121.48 58.98 89.01 58.98 90.84 63.78 121.49 63.78 108.4 79.84 114.33 79.84 129.07 61.38 114.33 42.98"/><path fill="#EA592A" d="M182.39,44.97c.28-.76.79-1.33,1.53-1.71.74-.38,1.83-.65,3.27-.81v-2.4h-15.55l-8.29,21.98c-.84,2.3-1.59,4.53-2.27,6.69-.17-.63-.34-1.26-.52-1.86-.5-1.66-1.25-3.73-2.25-6.21l-8.17-20.59h-15.55v2.4c1.44.16,2.52.43,3.24.81.72.38,1.22.95,1.5,1.71.28.76.42,1.86.42,3.3v20.71c0,2.04-.14,3.62-.42,4.74-.28,1.12-.79,1.97-1.53,2.55-.74.58-1.81.97-3.21,1.17v2.4h13.57v-2.4c-1.24-.2-2.18-.59-2.82-1.17-.64-.58-1.08-1.43-1.32-2.55-.24-1.12-.36-2.7-.36-4.74v-24.52c.59,2.46,1.3,4.76,2.16,6.87l11.95,28.88h2.76l10.63-28.04c.95-2.54,1.85-5.37,2.7-8.45v27.9c0,1.44-.11,2.54-.33,3.3-.22.76-.64,1.33-1.26,1.71-.62.38-1.51.65-2.67.81v2.4h17.59v-2.4c-1.44-.16-2.53-.43-3.27-.81-.74-.38-1.25-.95-1.53-1.71-.28-.76-.42-1.86-.42-3.3v-23.36c0-1.44.14-2.54.42-3.3Z"/></svg><svg x="154" y="0" width="203" height="42" viewBox="50 88 232 48"><path fill="#EA592A" d="M57.21,132.37c.76-.38,1.29-.95,1.59-1.71.3-.76.45-1.86.45-3.3v-24.32c0-1.44-.15-2.54-.45-3.3-.3-.76-.83-1.33-1.59-1.71-.76-.38-1.88-.65-3.36-.81v-1.92h16.37v1.92c-1.52.16-2.66.43-3.42.81-.76.38-1.29.95-1.59,1.71-.3.76-.45,1.86-.45,3.3v24.32c0,1.44.15,2.54.45,3.3.3.76.83,1.33,1.59,1.71.76.38,1.9.65,3.42.81v1.92h-16.37v-1.92c1.48-.16,2.6-.43,3.36-.81Z"/><path fill="#EA592A" d="M108.26,132.34c-.68-.4-1.16-.97-1.44-1.71-.28-.74-.42-1.77-.42-3.09v-12.55c0-3.8-.88-6.63-2.64-8.5-1.76-1.86-4.18-2.79-7.27-2.79-2.64,0-4.86.72-6.66,2.16-1.55,1.24-2.67,2.86-3.36,4.85v-.04h-.36c0-2.32-.08-4.46-.24-6.42h-.42l-9.37,1.98v1.86c1.88.16,3.17.53,3.87,1.11.7.58,1.05,1.45,1.05,2.61v15.73c0,1.32-.14,2.35-.42,3.09-.28.74-.76,1.31-1.44,1.71-.68.4-1.7.76-3.06,1.08v1.68h15.31v-1.68c-1.36-.32-2.38-.68-3.06-1.08-.68-.4-1.16-.97-1.44-1.71-.28-.74-.42-1.77-.42-3.09v-11.05c0-2.52.73-4.56,2.19-6.12,1.46-1.56,3.31-2.34,5.55-2.34s3.87.67,5.01,2.01c1.14,1.34,1.71,3.41,1.71,6.21v11.29c0,1.32-.14,2.35-.42,3.09-.28.74-.76,1.31-1.44,1.71-.68.4-1.7.76-3.06,1.08v1.68h15.37v-1.68c-1.4-.32-2.44-.68-3.12-1.08Z"/><path fill="#EA592A" d="M131.92,129.51c-1.28,1.16-2.7,1.74-4.26,1.74-2.8,0-4.2-1.48-4.2-4.44v-19.45h8.11v-3.12h-8.11v-4.5h-1.14l-9.37,6.18v1.44h5.04v20.47c0,2.48.65,4.38,1.95,5.7,1.3,1.32,3.15,1.98,5.55,1.98,1.88,0,3.47-.51,4.77-1.53,1.3-1.02,2.19-2.29,2.67-3.81l-1.02-.66Z"/><path fill="#EA592A" d="M163.05,117.93c0-4.44-1.06-7.93-3.18-10.45-2.12-2.52-5.06-3.78-8.83-3.78-2.68,0-5.08.69-7.21,2.07-2.12,1.38-3.79,3.35-5.01,5.91-1.22,2.56-1.83,5.54-1.83,8.95,0,3.04.56,5.69,1.68,7.96,1.12,2.26,2.73,4.01,4.83,5.25,2.1,1.24,4.55,1.86,7.36,1.86,3.04,0,5.62-.78,7.75-2.34,2.12-1.56,3.58-3.7,4.38-6.42l-1.32-.66c-2.2,2.92-5.2,4.38-9.01,4.38-3.2,0-5.69-1.01-7.48-3.03-1.66-1.89-2.54-4.81-2.65-8.74h20.51v-.96ZM156.27,115.55c-.32.3-.86.45-1.62.45h-12.04c.22-2.61.88-4.75,1.98-6.39,1.38-2.06,3.31-3.09,5.79-3.09,2.04,0,3.61.72,4.71,2.16,1.1,1.44,1.65,3.26,1.65,5.46,0,.64-.16,1.11-.48,1.41Z"/><path fill="#EA592A" d="M190.01,103.76c-.32-.04-.66-.06-1.02-.06-2.68,0-4.95.93-6.81,2.79-1.46,1.46-2.44,3.2-2.95,5.19h-.38c0-2.88-.08-5.36-.24-7.45h-.18l-9.37,1.98v1.86c1.88.16,3.17.53,3.87,1.11.7.58,1.05,1.45,1.05,2.61v15.73c0,1.32-.14,2.35-.42,3.09-.28.74-.76,1.31-1.44,1.71-.68.4-1.7.76-3.06,1.08v1.68h16.09v-1.68c-1.6-.32-2.79-.68-3.57-1.08-.78-.4-1.33-.97-1.65-1.71-.32-.74-.48-1.77-.48-3.09v-9.43c0-3.12.75-5.32,2.25-6.6,1.5-1.28,3.53-1.92,6.09-1.92.68,0,1.42.04,2.22.12.08-.92.12-1.92.12-3s-.04-2.06-.12-2.94Z"/><path fill="#EA592A" d="M204.06,98.65c1.24,0,2.25-.4,3.03-1.2.78-.8,1.17-1.78,1.17-2.94s-.39-2.19-1.17-2.97c-.78-.78-1.79-1.17-3.03-1.17s-2.25.39-3.03,1.17-1.17,1.77-1.17,2.97.39,2.19,1.17,2.97,1.79,1.17,3.03,1.17Z"/><path fill="#EA592A" d="M209.17,132.34c-.68-.4-1.16-.97-1.44-1.71-.28-.74-.42-1.77-.42-3.09v-14.83c0-2.76.12-5.58.36-8.47h-.66l-10.51,1.44v1.8c2.16.44,3.59.97,4.29,1.59.7.62,1.05,1.59,1.05,2.91v15.55c0,1.32-.14,2.35-.42,3.09-.28.74-.76,1.31-1.44,1.71-.68.4-1.7.76-3.06,1.08v1.68h15.37v-1.68c-1.4-.32-2.44-.68-3.12-1.08Z"/><path fill="#EA592A" d="M223.49,133.81c-2.22-1.26-3.95-3.09-5.19-5.49-1.24-2.4-1.86-5.26-1.86-8.59s.62-6.19,1.86-8.62c1.24-2.42,2.97-4.26,5.19-5.52,2.22-1.26,4.79-1.89,7.72-1.89s5.55.63,7.78,1.89c2.22,1.26,3.95,3.09,5.19,5.49,1.24,2.4,1.86,5.28,1.86,8.65s-.62,6.18-1.86,8.59c-1.24,2.4-2.97,4.23-5.19,5.49s-4.81,1.89-7.78,1.89-5.49-.63-7.72-1.89ZM237.42,129.48c1.5-2.3,2.25-5.55,2.25-9.76s-.75-7.46-2.25-9.79c-1.5-2.32-3.57-3.48-6.21-3.48s-4.66,1.16-6.18,3.48c-1.52,2.32-2.28,5.58-2.28,9.79s.76,7.46,2.28,9.76c1.52,2.3,3.58,3.45,6.18,3.45s4.71-1.15,6.21-3.45Z"/><path fill="#EA592A" d="M271.66,103.76c-.32-.04-.66-.06-1.02-.06-2.68,0-4.95.93-6.81,2.79-1.46,1.46-2.44,3.2-2.95,5.19h-.38c0-2.88-.08-5.36-.24-7.45h-.18l-9.37,1.98v1.86c1.88.16,3.17.53,3.87,1.11.7.58,1.05,1.45,1.05,2.61v15.73c0,1.32-.14,2.35-.42,3.09-.28.74-.76,1.31-1.44,1.71-.68.4-1.7.76-3.06,1.08v1.68h16.09v-1.68c-1.6-.32-2.79-.68-3.57-1.08-.78-.4-1.33-.97-1.65-1.71-.32-.74-.48-1.77-.48-3.09v-9.43c0-3.12.75-5.32,2.25-6.6,1.5-1.28,3.53-1.92,6.09-1.92.68,0,1.42.04,2.22.12.08-.92.12-1.92.12-3s-.04-2.06-.12-2.94Z"/></svg></svg>`;

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<base href="${baseUrl}/">
<title>Průvodka — ${esc(projectId)}</title>
<style>
  @font-face { font-family: 'Early Sans'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/EarlySans-Regular.woff2') format('woff2'), url('/fonts/EarlySans-Regular.woff') format('woff'); }
  @font-face { font-family: 'Early Sans'; font-weight: 600; font-style: normal; font-display: swap; src: url('/fonts/EarlySans-Bold.woff2') format('woff2'), url('/fonts/EarlySans-Bold.woff') format('woff'); }
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Early Sans', system-ui, sans-serif; font-size: 9pt; color: #1f2937; padding: 6mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #1a3330;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .logo-area { display: flex; align-items: center; }

  .doc-title { text-align: right; }
  .doc-title h1 { font-family: 'Early Sans', system-ui, sans-serif; font-size: 12pt; font-weight: 600; color: #1a3330; }

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
  <div class="logo-area">${logoSvg}</div>
  <div class="doc-title">
    <h1>Seznam výkresové dokumentace</h1>
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
