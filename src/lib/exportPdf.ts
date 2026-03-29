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

  const MIN_ROWS = 20;
  const emptyRowCount = Math.max(0, MIN_ROWS - rows.length);

  const tableRows = rows.map(r => {
    const warnCell = hasUnapproved
      ? `<td class="c bm" style="color:#f59e0b;font-size:14pt;">${r.isApproved ? "" : "⚠"}</td>`
      : "";
    return `<tr class="data-row">
      ${warnCell}
      <td class="c bt">${r.rowNum}</td>
      <td class="c bt">${esc(r.kodPrvku)}</td>
      <td class="item-name bt">${esc(r.nazevPrvku)}</td>
      <td class="c bt">${esc(r.konstrukter)}</td>
      <td class="c bt">${r.pocet != null ? esc(String(r.pocet)) : ""}</td>
      <td class="bt" style="text-align:left;">${esc(r.notes)}</td>
    </tr>`;
  }).join("\n");

  const dataCols = hasUnapproved ? 7 : 6;
  const emptyRows = Array.from({ length: emptyRowCount }, () =>
    `<tr class="data-row">${Array.from({ length: dataCols }, () => `<td class="bt">&nbsp;</td>`).join("")}</tr>`
  ).join("\n");

  const warnTh = hasUnapproved ? `<th class="bm c" style="width:24px;"></th>` : "";

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<base href="${baseUrl}/">
<title>Průvodka — ${esc(projectId)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 12mm 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Aptos Narrow', 'Arial Narrow', Calibri, Arial, sans-serif; font-size: 10pt; color: #1a1a1a; padding: 0; padding-bottom: 20mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .wrap { width: 100%; margin: 0 auto; }
  .logo-bar { width: 100%; margin: 0; padding: 0; line-height: 0; }
  .logo-bar img { object-fit: fill; width: 100%; display: block; }

  .bm { border: 1.5px solid #333; }
  .bt { border: 0.75px solid #999; }
  .bn { border: none; }
  .c { text-align: center; }

  .info { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 2px; }
  .info td { padding: 3px 6px; vertical-align: middle; }
  .info .lbl { font-size: 10pt; font-weight: 400; }
  .info .val-name { font-size: 12pt; font-weight: 700; text-align: center; }
  .info .val-id { font-size: 11pt; font-weight: 700; text-align: center; }
  .info .sec-lbl { font-size: 10pt; font-weight: 700; }
  .info .sec-val { font-size: 10pt; }

  .dtable { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10pt; }
  .dtable thead th { background: #f5f5f0; font-weight: 600; font-size: 10pt; padding: 4px 6px; }
  .dtable thead th.num-hdr { font-size: 14pt; width: 30px; }
  .dtable .data-row td { padding: 2px 6px; height: 20pt; vertical-align: middle; }
  .dtable .item-name { text-align: left; padding-left: 10px; }

  .footer-row { margin-top: 10px; display: flex; justify-content: space-between; font-size: 10pt; }

  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; }
  @media print { body { padding-bottom: 20mm; } .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="wrap">

<div class="logo-bar">
  <img src="/images/ami-logo-claim.png" alt="A→M Interior" />
</div>
<hr class="sep" />

<table class="info">
  <tr>
    <td class="lbl" style="width:75%;">NÁZEV AKCE:</td>
    <td class="lbl c" style="width:25%;">Č.ZAKÁZKY:</td>
  </tr>
  <tr>
    <td class="val-name bm">${esc(projectName)}</td>
    <td class="val-id bm">${esc(projectId)}</td>
  </tr>
  <tr>
    <td class="sec-lbl">předání:</td>
    <td class="sec-lbl" style="text-align:right;">datum a podpis odpovědné osoby:</td>
  </tr>
  <tr>
    <td class="sec-val bt">výpis materiálu a kování k objednání</td>
    <td class="bt">&nbsp;</td>
  </tr>
  <tr>
    <td class="sec-val bt">kontrola dokumentace vedoucím projekce</td>
    <td class="bt">&nbsp;</td>
  </tr>
  <tr>
    <td class="sec-val bt">termín výroby</td>
    <td class="bt">&nbsp;</td>
  </tr>
</table>

<table class="dtable">
  <thead><tr>
    ${warnTh}
    <th class="num-hdr bm c">#</th>
    <th class="bm c" style="width:100px;">Kód prvku</th>
    <th class="bm">Název prvku</th>
    <th class="bm c" style="width:100px;">Konstruktér</th>
    <th class="bm c" style="width:50px;">Počet</th>
    <th class="bm" style="width:140px;">Poznámka</th>
  </tr></thead>
  <tbody>
    ${tableRows}
    ${emptyRows}
  </tbody>
</table>

<div class="footer-row">
  <span>Vytiskl: ${esc(issuedBy)}</span>
  <span>Datum: ${dateStr}</span>
</div>

<div style="margin-top:12px; padding-top:6px; border-top:0.75px solid #ccc; text-align:center; font-size:8pt; color:#6b7280;">
  AM Interior Group, s.r.o., Záhumení V 322, Louky, 763 02 Zlín &nbsp;|&nbsp; IČ: 23032693, DIČ: CZ23032693 &nbsp;|&nbsp; aminterior.cz
</div>

</div>
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
