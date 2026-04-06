

# AI-Powered CN Extraction — Full Rewrite Plan

## Problem

The current extraction has two paths:
1. **Excel (XLSX)**: Deterministic parser that tries to find items by regex pattern `[A-Z]\d{2,3}`. Works for some formats but **misses popis** (materials, hardware descriptions) because continuation rows aren't reliably detected across different CN formats.
2. **PDF**: Uses Claude (Anthropic) which works better but the prompt could be improved.

The core issue: the deterministic XLSX parser is brittle — different suppliers use different layouts, column orders, and description styles. An AI approach would handle this variability naturally.

## Solution

Replace the deterministic Excel parser with AI extraction using **Lovable AI** (already available via `LOVABLE_API_KEY`). This means:
- Both PDF and XLSX go through AI extraction
- One unified, high-quality prompt handles all CN formats
- No more column-index guessing or continuation-row detection bugs

## Technical Plan

### 1. Rewrite `extract-tpv-from-sharepoint/index.ts` — Excel path

**Current**: `extractFromExcel` → `parseXlsxItems` → deterministic column parsing
**New**: `extractFromExcel` → extract raw text from XLSX → send to Lovable AI (Gemini)

- Keep `parseSharedStrings` and `parseWorksheetCells` — they correctly extract cell text
- Replace the item-detection logic with a simple "rows to text" dump
- Send the text to Lovable AI Gateway (`google/gemini-2.5-flash`) with a refined prompt
- This is cheaper and faster than Claude, and doesn't require ANTHROPIC_API_KEY

The new flow:
```text
XLSX → unzip → parse cells → dump as TSV text → Lovable AI → structured JSON
```

### 2. Rewrite `extract-tpv/index.ts` — Manual upload path

Same change: replace deterministic XLSX parsing with Lovable AI. Keep PDF path using Claude (it works well with the document/vision API).

### 3. Unified extraction prompt

Write one high-quality Czech CN extraction prompt that:
- Identifies item codes (various formats: T01, K01, D-01, SK01, etc.)
- Extracts `nazev` (short name, max 40 chars)
- Collects ALL description/specification text into `popis` (materials, hardware, finishes, dimensions)
- Gets `cena` (unit price) and `pocet` (quantity)
- Skips totals, transport, montáž, section headers, room labels
- Uses tool calling for structured output (no JSON-in-text parsing)

### 4. Keep PDF extraction as-is (Claude)

The Anthropic PDF extraction with `pdfs-2024-09-25` beta works well for visual PDF documents. Keep it. Only improve the prompt to match the unified field definitions.

### 5. No frontend changes needed

The `TPVExtractor.tsx` component already maps `item_name`, `nazev`, `popis`, `cena`, `pocet` correctly. The AI will return these same fields.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/extract-tpv-from-sharepoint/index.ts` | Replace `extractFromExcel` to use Lovable AI instead of deterministic parsing. Keep SharePoint/Graph code unchanged. |
| `supabase/functions/extract-tpv/index.ts` | Replace `extractFromXLSX` to use Lovable AI. Keep PDF Claude path. |

## Why Lovable AI over Claude for Excel

- `LOVABLE_API_KEY` is already configured — no extra secrets
- `google/gemini-2.5-flash` is fast and cheap for structured extraction
- Tool calling gives clean JSON output without parsing hacks
- Claude is better for PDFs (native document vision), but for text extraction from already-parsed Excel cells, Gemini is sufficient and more cost-effective

