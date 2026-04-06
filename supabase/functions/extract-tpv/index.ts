import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Claude prompt — only used for PDF files
const SYSTEM_PROMPT = `You extract line items from Czech furniture price offers (cenová nabídka).
Return ONLY a valid JSON array, no markdown, no explanation.

Field definitions:
- item_name = short code exactly as in the document (T01, K01, D-01, etc.)
- nazev = SHORT item name (max 40 chars, no dimensions/materials)
- popis = complete TECHNICAL description with materials, hardware, finishes, dimensions
- cena = unit price in CZK (number only)
- pocet = quantity, default 1

SKIP: totals, subtotals, section headers, transport, montáž.
Return ONLY valid JSON array.`;

// ─── SHARED STRINGS ───────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts: string[] = [];
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      parts.push(t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#13;/g, ''));
    }
    strings.push(parts.join(''));
  }
  return strings;
}

// ─── WORKSHEET CELLS ──────────────────────────────────────────────────────────

function parseWorksheetCells(xml: string, ss: string[]): (string | null)[][] {
  function colToIdx(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  const rows: (string | null)[][] = [];
  for (const rm of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = parseInt(rm[1]) - 1;
    const cells: (string | null)[] = [];
    for (const cm of rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], body = cm[2];
      const ref = attrs.match(/r="([A-Z]+)\d+"/);
      if (!ref) continue;
      const colIdx = colToIdx(ref[1]);
      const t = (attrs.match(/t="([^"]*)"/)||[])[1] || '';
      const v = (body.match(/<v>([\s\S]*?)<\/v>/)||[])[1] || null;
      let val = v;
      if (val && t === 's') {
        const i = parseInt(val);
        val = (i >= 0 && i < ss.length) ? ss[i] : val;
      }
      while (cells.length <= colIdx) cells.push(null);
      cells[colIdx] = val?.trim() || null;
    }
    while (rows.length <= rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }
  return rows;
}

// ─── CN PARSER ────────────────────────────────────────────────────────────────

const ITEM_CODE_RE = /^[A-Z]\d{2}$/;

const STOP_TEXTS = [
  'celkem součet', 'celkem bez dph', 'cena celkem včetně dph', 'dph',
  'doprava - nákladní', 'doprava', 'montáž a přesun', 'montáž',
  'manipulace', 'odvoz a likvidace', 'odvoz',
  'jiné náklady', 'cenová nabídka platí',
  'platební podmínky', 'technologická doba', 'součástí cenové nabídky nejsou'
];

const ROOM_LABELS = new Set([
  'Dětský pokoj 1', 'Dětský pokoj 2', 'Dětský pokoj 3',
  'Ložnice', 'Chodba', 'Koupelna', 'Kuchyň', 'Obývací pokoj',
  'Pracovna', 'Předsíň', 'Jídelna', 'Šatna', 'Technická místnost',
]);

function parseCN(rows: (string | null)[][]): any[] {
  const items: any[] = [];
  let cur: any = null;
  let collecting = true;

  for (const cells of rows) {
    const kod = cells[0]?.trim() ?? '';
    const nazev_popis = cells[1]?.trim() ?? '';
    const rozmer = cells[2]?.trim() ?? '';
    const pocet = cells[3] ? parseFloat(cells[3].replace(/\s/g, '').replace(',', '.')) || null : null;
    const jcena = cells[4] ? parseFloat(cells[4].replace(/\s/g, '').replace(',', '.')) || null : null;
    const ccena = cells[5] ? parseFloat(cells[5].replace(/\s/g, '').replace(',', '.')) || null : null;

    if (ITEM_CODE_RE.test(kod)) {
      // Code exists but no price AND no count = continuation description (e.g. K02 = material note for K01)
      if (cur && !jcena && pocet === null) {
        if (nazev_popis) cur._popis.push(nazev_popis);
        continue;
      }
      if (cur) items.push(finalize(cur));
      cur = { kod_prvku: kod, nazev: nazev_popis, rozmer, pocet, jcena, ccena, _popis: [] };
      collecting = true;
    } else if (cur && collecting && !kod && nazev_popis) {
      const t = nazev_popis.toLowerCase();
      if (STOP_TEXTS.some(s => t.includes(s))) {
        collecting = false;
      } else if (!ROOM_LABELS.has(nazev_popis)) {
        cur._popis.push(nazev_popis);
      }
    }
  }
  if (cur) items.push(finalize(cur));
  return items;
}

function finalize(cur: any) {
  const popis = cur._popis.join(' ');
  return {
    item_name: cur.kod_prvku,
    nazev: cur.nazev,
    popis: [cur.rozmer, popis].filter(Boolean).join(' '),
    cena: cur.jcena ?? 0,
    pocet: cur.pocet ?? 1,
    jednotka: 'ks',
  };
}

// ─── MAIN XLSX EXTRACTION (deterministic, no Claude) ──────────────────────────

async function extractFromXLSX(buffer: ArrayBuffer): Promise<any[]> {
  const zipReader = new ZipReader(new BlobReader(new Blob([buffer])));
  const entries = await zipReader.getEntries();
  let ssXml = '', wsXml = '';
  for (const e of entries) {
    if (e.filename === 'xl/sharedStrings.xml') ssXml = await e.getData!(new TextWriter());
    if (e.filename === 'xl/worksheets/sheet1.xml') wsXml = await e.getData!(new TextWriter());
  }
  await zipReader.close();
  const ss = parseSharedStrings(ssXml);
  const rows = parseWorksheetCells(wsXml, ss);
  return parseCN(rows);
}

// ─── PDF EXTRACTION (Claude API) ──────────────────────────────────────────────

async function extractFromPDF(fileBase64: string): Promise<any[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
          { type: "text", text: "Extract all priced line items. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis. Skip group headers without prices." },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Claude API error:", response.status, err);
    throw new Error(`Claude API error [${response.status}]: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

// ─── HTTP HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or mimeType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mimeType === "application/pdf";
    let items: any[];

    if (isPdf) {
      console.log("Extracting from PDF via Claude API");
      items = await extractFromPDF(fileBase64);
    } else {
      console.log("Extracting from XLSX deterministically");
      const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
      items = await extractFromXLSX(bytes.buffer);
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-tpv error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
