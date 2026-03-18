import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Check, AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Target fields (TPV List columns — fixed) ─────────────────────
const TARGET_FIELDS = [
  { key: "item_name", label: "Kód Prvku", required: true },
  { key: "item_type", label: "Název Prvku", required: true },
  { key: "nazev_prvku", label: "Popis", required: false },
  { key: "pocet", label: "Počet", required: false },
  { key: "cena", label: "Cena", required: false },
  { key: "konstrukter", label: "Konstruktér", required: false },
  { key: "notes", label: "Poznámka", required: false },
  { key: "status", label: "Status", required: false },
  { key: "sent_date", label: "Odesláno", required: false },
  { key: "accepted_date", label: "Přijato", required: false },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

// ── Fuzzy matching ────────────────────────────────────────────────
// Each entry has exact phrases tried first, then loose keywords as fallback.
// Order matters: more specific entries should come first.
const FUZZY_MAP: { exact: string[]; contains: string[]; target: TargetKey }[] = [
  { exact: ["kod prvku", "kod", "kod polozky", "item code", "element code", "id prvku"], contains: ["code"], target: "item_name" },
  { exact: ["nazev prvku", "nazev polozky", "nazev", "element name", "item name"], contains: ["name"], target: "item_type" },
  { exact: ["popis", "description", "detail", "specifikace", "spec"], contains: ["descript", "specif"], target: "nazev_prvku" },
  { exact: ["pocet", "qty", "quantity", "ks", "mnozstvi", "pcs"], contains: ["quantit"], target: "pocet" },
  { exact: ["cena", "price", "cost", "castka"], contains: ["price", "cost"], target: "cena" },
  { exact: ["konstrukter", "engineer", "designer"], contains: ["konstrukt", "engineer"], target: "konstrukter" },
  { exact: ["poznamka", "note", "notes"], contains: ["poznam", "note"], target: "notes" },
  { exact: ["status", "stav", "stav tpv"], contains: ["status", "stav"], target: "status" },
  { exact: ["odeslano", "sent", "sent date", "odesláno"], contains: ["odeslan", "sent"], target: "sent_date" },
  { exact: ["prijato", "accepted", "accepted date", "přijato"], contains: ["prijat", "accept"], target: "accepted_date" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}

function fuzzyMatch(header: string): TargetKey | null {
  const n = normalize(header);

  // Priority 1: Exact match on full normalized header
  for (const { exact, target } of FUZZY_MAP) {
    if (exact.some(k => n === normalize(k))) return target;
  }

  // Priority 2: Header starts with an exact keyword
  for (const { exact, target } of FUZZY_MAP) {
    if (exact.some(k => n.startsWith(normalize(k)))) return target;
  }

  // Priority 3: Header contains a contains-keyword (less greedy)
  for (const { contains, target } of FUZZY_MAP) {
    if (contains.some(k => n.includes(normalize(k)))) return target;
  }

  return null;
}

function parseNumericValue(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  let cleaned = value.toString().replace(/\s/g, "").replace(/[€$Kč]/gi, "").trim();
  if (!cleaned) return null;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, "");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// ── Component ─────────────────────────────────────────────────────
interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: any[][];
}

type Mapping = Record<TargetKey, number | null>;

interface RowData {
  values: Record<TargetKey, string>;
  selected: boolean;
  status: "valid" | "warning" | "error";
  rawIdx: number;
  duplicateCode?: boolean;
}

// ── Example data for format guide ─────────────────────────────────
const EXAMPLE_ROWS = [
  { kod: "TK.01", nazev: "Kuchyň", popis: "Spodní skříňky, dub", pocet: "1", cena: "85 000" },
  { kod: "SK.01", nazev: "Šatní skříň", popis: "Vestavná, posuvné dveře", pocet: "2", cena: "42 000" },
  { kod: "OB.01", nazev: "Obývací stěna", popis: "TV stěna, dýha ořech", pocet: "1", cena: "68 000" },
];

export function ExcelImportWizard({ projectId, projectName, open, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Step 1
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [uploadTime, setUploadTime] = useState<Date | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [activeSheet, setActiveSheet] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({} as Mapping);
  const [autoMatched, setAutoMatched] = useState<Set<TargetKey>>(new Set());

  // Step 3
  const [rows, setRows] = useState<RowData[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite">("skip");
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());

  // Step 4
  const [importResult, setImportResult] = useState<{ imported: number; warnings: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleCancel = () => {
    if (file) setCancelConfirmOpen(true);
    else onClose();
  };

  const confirmCancel = () => {
    setCancelConfirmOpen(false);
    reset();
    onClose();
  };

  // ── Step 1: File handling ─────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    setFile(f);
    setUploadTime(new Date());
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: "array" });
      const parsed: ParsedSheet[] = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const headers = aoa.length > 0 ? aoa[0].map(String) : [];
        const dataRows = aoa.slice(1);
        return { name, headers, rows: dataRows };
      });
      setSheets(parsed);
      if (parsed.length > 0) {
        autoMapSheet(parsed[0]);
        setActiveSheet(0);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const autoMapSheet = (sheet: ParsedSheet) => {
    const newMapping: Mapping = {} as Mapping;
    const matched = new Set<TargetKey>();
    const usedCols = new Set<number>();

    for (const field of TARGET_FIELDS) {
      for (let i = 0; i < sheet.headers.length; i++) {
        if (usedCols.has(i)) continue;
        const match = fuzzyMatch(sheet.headers[i]);
        if (match === field.key) {
          newMapping[field.key] = i;
          matched.add(field.key);
          usedCols.add(i);
          break;
        }
      }
    }
    for (const f of TARGET_FIELDS) {
      if (!(f.key in newMapping)) newMapping[f.key] = null;
    }
    setMapping(newMapping);
    setAutoMatched(matched);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const removeFile = () => {
    setFile(null);
    setSheets([]);
    setMapping({} as Mapping);
    setAutoMatched(new Set());
    setUploadTime(null);
  };

  // ── Step 2: Mapping ─────────────────────────────────────────
  const currentSheet = sheets[activeSheet];

  const setMappingForField = (fieldKey: TargetKey, colIdx: number | null) => {
    setMapping(prev => {
      const next = { ...prev };
      if (colIdx !== null) {
        for (const k of Object.keys(next) as TargetKey[]) {
          if (next[k] === colIdx) next[k] = null;
        }
      }
      next[fieldKey] = colIdx;
      return next;
    });
    setAutoMatched(prev => {
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
  };

  const usedColIndices = useMemo(() => new Set(Object.values(mapping).filter(v => v !== null) as number[]), [mapping]);
  const requiredMapped = TARGET_FIELDS.filter(f => f.required).every(f => mapping[f.key] !== null && mapping[f.key] !== undefined);

  const handleSheetChange = (idx: number) => {
    setActiveSheet(idx);
    const sheet = sheets[idx];
    if (sheet) autoMapSheet(sheet);
  };

  // ── Step 2 → 3: Build rows ────────────────────────────────
  const buildRows = async () => {
    if (!currentSheet) return;

    const { data: existingItems } = await supabase
      .from("tpv_items")
      .select("item_name")
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const codes = new Set((existingItems || []).map(i => i.item_name).filter(Boolean) as string[]);
    setExistingCodes(codes);

    const built: RowData[] = [];
    for (let rawIdx = 0; rawIdx < currentSheet.rows.length; rawIdx++) {
      const row = currentSheet.rows[rawIdx];
      const values: Record<string, string> = {} as any;

      let hasAnyData = false;
      for (const f of TARGET_FIELDS) {
        const colIdx = mapping[f.key];
        if (colIdx !== null && colIdx !== undefined) {
          const v = String(row[colIdx] ?? "").trim();
          values[f.key] = v;
          if (v) hasAnyData = true;
        } else {
          values[f.key] = "";
        }
      }
      if (!hasAnyData) continue;

      const hasCode = !!values.item_name;
      const hasName = !!values.item_type;
      const isDuplicate = hasCode && codes.has(values.item_name);
      const status: "valid" | "warning" | "error" =
        (!hasCode || !hasName) ? "error" : isDuplicate ? "warning" : "valid";

      built.push({
        values: values as Record<TargetKey, string>,
        selected: status !== "error",
        status,
        rawIdx,
        duplicateCode: isDuplicate,
      });
    }
    setRows(built);
  };

  // ── Step 3: Stats ──────────────────────────────────────────
  const stats = useMemo(() => {
    const selected = rows.filter(r => r.selected);
    const skipped = rows.length - selected.length;
    const warnings = rows.filter(r => r.status === "warning").length;
    const errors = rows.filter(r => r.status === "error").length;
    return { selected: selected.length, skipped, warnings, errors, total: rows.length };
  }, [rows]);

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = (val: boolean) => {
    setRows(prev => prev.map(r => r.status !== "error" ? { ...r, selected: val } : r));
  };

  // ── Step 3 → 4: Import ────────────────────────────────────
  const doImport = async () => {
    const toImport = rows.filter(r => r.selected);
    if (!toImport.length) return;
    setImporting(true);

    try {
      const duplicates = toImport.filter(r => r.duplicateCode);
      const newItems = toImport.filter(r => !r.duplicateCode);

      if (newItems.length > 0) {
        const items = newItems.map(r => ({
          project_id: projectId,
          item_name: r.values.item_name || "Bez kódu",
          item_type: r.values.item_type || null,
          nazev_prvku: r.values.nazev_prvku || null,
          konstrukter: r.values.konstrukter || null,
          notes: r.values.notes || null,
          pocet: r.values.pocet ? parseNumericValue(r.values.pocet) : null,
          cena: r.values.cena ? parseNumericValue(r.values.cena) : null,
          status: r.values.status || null,
          sent_date: r.values.sent_date || null,
          accepted_date: r.values.accepted_date || null,
          imported_at: new Date().toISOString(),
          import_source: file?.name || null,
        }));
        const { error } = await supabase.from("tpv_items").insert(items as any);
        if (error) throw error;
      }

      if (duplicates.length > 0 && duplicateMode === "overwrite") {
        for (const r of duplicates) {
          await supabase.from("tpv_items")
            .update({
              item_type: r.values.item_type || null,
              nazev_prvku: r.values.nazev_prvku || null,
              konstrukter: r.values.konstrukter || null,
              notes: r.values.notes || null,
              pocet: r.values.pocet ? parseNumericValue(r.values.pocet) : null,
              cena: r.values.cena ? parseNumericValue(r.values.cena) : null,
              status: r.values.status || null,
              sent_date: r.values.sent_date || null,
              accepted_date: r.values.accepted_date || null,
            } as any)
            .eq("project_id", projectId)
            .eq("item_name", r.values.item_name)
            .is("deleted_at", null);
        }
      }

      const importedCount = newItems.length + (duplicateMode === "overwrite" ? duplicates.length : 0);
      const skippedDups = duplicateMode === "skip" ? duplicates.length : 0;

      setImportResult({
        imported: importedCount,
        warnings: duplicates.length,
        skipped: rows.length - toImport.length + skippedDups,
      });
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      setStep(4);
    } catch (err) {
      toast({ title: "Chyba při importu", description: String(err), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setSheets([]);
    setMapping({} as Mapping);
    setAutoMatched(new Set());
    setRows([]);
    setImportResult(null);
    setUploadTime(null);
    setExistingCodes(new Set());
  };

  if (!open) return null;

  const STEPS = ["Nahrání souboru", "Mapování sloupců", "Náhled & validace", "Import"];
  const previewRows = currentSheet?.rows.slice(0, 5) || [];

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 shadow-sm bg-primary text-primary-foreground">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5" />
          <span className="font-semibold">Import Excel — {projectId}</span>
          <span className="text-sm opacity-70">{projectName}</span>
        </div>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={handleCancel}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center py-4 px-6 gap-0 bg-card border-b">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          return (
            <div key={i} className="flex items-center">
              {i > 0 && <div className={cn("w-12 h-0.5 mx-1", isComplete ? "bg-green-600" : "bg-muted-foreground/20")} />}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  isComplete && "bg-green-600 border-green-600 text-white",
                  isActive && "bg-primary border-primary text-primary-foreground",
                  !isComplete && !isActive && "border-muted-foreground/30 text-muted-foreground",
                )}>
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : stepNum}
                </div>
                <span className={cn("text-xs font-medium hidden sm:inline", isActive ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className={cn("flex-1 overflow-auto px-6 pb-6", step === 3 && "overflow-hidden flex flex-col")}>

        {/* ─── STEP 1: Upload + Format Guide ──────────────── */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto mt-6 space-y-4">
            <Card>
              <CardContent className="p-8">
                {!file ? (
                  <div
                    className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 text-center cursor-pointer hover:border-green-500 hover:bg-green-50/30 transition-colors"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium text-sm">Přetáhněte soubor sem</p>
                    <p className="text-xs text-muted-foreground mt-1">nebo klikněte pro výběr • .xlsx, .xls, .csv, .tsv</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-8 w-8 text-green-700" />
                        <div>
                          <p className="font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB • {sheets.length} {sheets.length === 1 ? "list" : "listů"} • {uploadTime?.toLocaleTimeString("cs-CZ")}
                          </p>
                          {sheets.map((s, i) => (
                            <span key={i} className="inline-block text-xs bg-white border rounded px-2 py-0.5 mr-1 mt-1">{s.name} ({s.rows.length} řádků)</span>
                          ))}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={removeFile}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Preview first 5 rows */}
                    {currentSheet && currentSheet.headers.length > 0 && (
                      <div className="rounded border overflow-auto max-h-[200px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {currentSheet.headers.map((h, i) => (
                                <TableHead key={i} className="text-xs whitespace-nowrap font-semibold bg-muted/50">{h || `(${i + 1})`}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewRows.map((row, ri) => (
                              <TableRow key={ri}>
                                {currentSheet.headers.map((_, ci) => (
                                  <TableCell key={ci} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                                    {String(row[ci] ?? "")}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleCancel}>Zrušit</Button>
                      <Button className="flex-1" onClick={() => setStep(2)} disabled={sheets.length === 0}>
                        Pokračovat na mapování <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Format guide info box */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Jak připravit Excel pro import:</p>
                  <ul className="text-xs text-blue-800 mt-1.5 space-y-1 list-disc pl-4">
                    <li>První řádek musí obsahovat názvy sloupců (hlavičku)</li>
                    <li>Každý sloupec by měl obsahovat jeden typ informace</li>
                    <li>Buňky nesmí obsahovat sloučené řádky nebo sloupce</li>
                    <li><strong>Kód prvku</strong> a <strong>Název prvku</strong> jsou povinné</li>
                  </ul>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-blue-900 mb-1.5">Příklad správného formátu:</p>
                <div className="rounded border border-blue-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-blue-100/80">
                        <th className="px-3 py-1.5 text-left font-semibold text-blue-900">Kód</th>
                        <th className="px-3 py-1.5 text-left font-semibold text-blue-900">Název</th>
                        <th className="px-3 py-1.5 text-left font-semibold text-blue-900">Popis</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-blue-900">Počet</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-blue-900">Cena</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXAMPLE_ROWS.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/50"}>
                          <td className="px-3 py-1 font-mono text-blue-800">{r.kod}</td>
                          <td className="px-3 py-1 font-semibold">{r.nazev}</td>
                          <td className="px-3 py-1 text-muted-foreground">{r.popis}</td>
                          <td className="px-3 py-1 text-right">{r.pocet}</td>
                          <td className="px-3 py-1 text-right">{r.cena}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Column Mapping (Excel → TPV) ────────── */}
        {step === 2 && currentSheet && (
          <div className="max-w-3xl mx-auto mt-4 space-y-4">
            {sheets.length > 1 && (
              <div className="flex gap-1">
                {sheets.map((s, i) => (
                  <Button key={i} variant={activeSheet === i ? "default" : "outline"} size="sm" onClick={() => handleSheetChange(i)} className="text-xs">
                    List {i + 1} — {s.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Excel preview (top) */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Náhled importovaného souboru</p>
                <div className="rounded border overflow-auto max-h-[140px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {currentSheet.headers.map((h, i) => (
                          <TableHead key={i} className="text-xs whitespace-nowrap font-semibold bg-muted/50">
                            <span className="text-muted-foreground/60 mr-1">{colLetter(i)}:</span>
                            {h || `(sloupec ${i + 1})`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentSheet.rows.slice(0, 3).map((row, ri) => (
                        <TableRow key={ri}>
                          {currentSheet.headers.map((_, ci) => (
                            <TableCell key={ci} className="text-xs whitespace-nowrap max-w-[180px] truncate">
                              {String(row[ci] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Mapping interface (Excel LEFT → TPV RIGHT) */}
            <Card>
              <CardContent className="p-4">
                {/* Header labels */}
                <div className="grid grid-cols-[1fr_32px_1fr] gap-x-3 items-center mb-3 pb-2 border-b">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Excel sloupec (import)</div>
                  <div />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TPV List (cíl)</div>
                </div>

                <div className="space-y-2">
                  {TARGET_FIELDS.map(field => {
                    const colIdx = mapping[field.key];
                    const isMapped = colIdx !== null && colIdx !== undefined;
                    const isAuto = autoMatched.has(field.key);

                    return (
                      <div key={field.key} className="grid grid-cols-[1fr_32px_1fr] gap-x-3 items-center">
                        {/* LEFT: Excel column dropdown */}
                        <div className="flex items-center gap-2">
                          <Select
                            value={colIdx !== null && colIdx !== undefined ? String(colIdx) : "__none__"}
                            onValueChange={v => setMappingForField(field.key, v === "__none__" ? null : Number(v))}
                          >
                            <SelectTrigger className={cn(
                              "h-9 text-xs",
                              !isMapped && field.required && "border-destructive/50 bg-destructive/5",
                              isMapped && "border-green-300 bg-green-50/50",
                            )}>
                              <SelectValue placeholder="Vyberte sloupec" />
                            </SelectTrigger>
                            <SelectContent className="z-[100001]">
                              <SelectItem value="__none__">— Vyberte sloupec —</SelectItem>
                              {currentSheet.headers.map((h, i) => {
                                const mappedToOther = usedColIndices.has(i) && mapping[field.key] !== i;
                                const otherField = mappedToOther
                                  ? TARGET_FIELDS.find(f => f.key !== field.key && mapping[f.key] === i)
                                  : null;
                                return (
                                  <SelectItem key={i} value={String(i)}>
                                    <span className="text-muted-foreground mr-1">{colLetter(i)}:</span>
                                    {h || `(sloupec ${i + 1})`}
                                    {otherField && (
                                      <span className="text-muted-foreground/60 ml-1 text-[10px]">(→ {otherField.label})</span>
                                    )}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {isAuto && isMapped && (
                            <span className="text-[10px] text-green-600 whitespace-nowrap flex items-center gap-0.5 shrink-0">
                              <Check className="h-3 w-3" /> auto
                            </span>
                          )}
                        </div>

                        {/* CENTER: Arrow */}
                        <div className="flex items-center justify-center">
                          {isMapped ? (
                            <ArrowRight className="h-4 w-4 text-green-600" />
                          ) : field.required ? (
                            <ArrowRight className="h-4 w-4 text-destructive/50" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-muted-foreground/20" />
                          )}
                        </div>

                        {/* RIGHT: TPV field name (fixed) */}
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm",
                            field.required ? "font-semibold" : "font-medium text-muted-foreground",
                          )}>
                            {field.label}
                          </span>
                          {field.required && <span className="text-destructive text-xs font-bold">*</span>}
                          {!field.required && !isMapped && (
                            <span className="text-[10px] text-muted-foreground/50 italic">volitelné</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {!requiredMapped && (
              <div className="flex items-center gap-2 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-md text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Povinná pole (Kód Prvku, Název Prvku) musí být namapována pro pokračování
              </div>
            )}

            <div className="flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Zpět
                </Button>
                <Button variant="outline" onClick={handleCancel}>Zrušit</Button>
              </div>
              <Button onClick={() => { buildRows(); setStep(3); }} disabled={!requiredMapped}>
                Pokračovat na náhled <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Preview & Validate ──────────────────── */}
        {step === 3 && (
          <>
            <div className="sticky top-0 z-10 bg-background pb-2 space-y-2 shrink-0 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <div className="px-3 py-1.5 rounded-md border text-xs font-medium text-foreground bg-card">
                    {stats.total} položek celkem
                  </div>
                  <div className="px-3 py-1.5 rounded-md border text-xs font-medium text-green-700 bg-green-50 border-green-200">
                    {stats.selected} k importu
                  </div>
                  {stats.warnings > 0 && (
                    <div className="px-3 py-1.5 rounded-md border text-xs font-medium text-orange-700 bg-orange-50 border-orange-200">
                      {stats.warnings} varování (duplicity)
                    </div>
                  )}
                  {stats.errors > 0 && (
                    <div className="px-3 py-1.5 rounded-md border text-xs font-medium text-red-700 bg-red-50 border-red-200">
                      {stats.errors} chyb
                    </div>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {stats.warnings > 0 && (
                    <Select value={duplicateMode} onValueChange={v => setDuplicateMode(v as "skip" | "overwrite")}>
                      <SelectTrigger className="h-8 text-xs w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[100001]">
                        <SelectItem value="skip">Přeskočit duplicity</SelectItem>
                        <SelectItem value="overwrite">Přepsat duplicity</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Zpět
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancel}>Zrušit</Button>
                  <Button size="sm" onClick={doImport} disabled={importing || stats.selected === 0} className="bg-green-600 hover:bg-green-700 text-white">
                    {importing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importuji...</>
                    ) : (
                      <>Importovat {stats.selected} položek</>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 sticky top-0 bg-card z-10">
                      <Checkbox checked={rows.filter(r => r.status !== "error").every(r => r.selected)} onCheckedChange={(v) => selectAll(!!v)} />
                    </TableHead>
                    <TableHead className="w-10 sticky top-0 bg-card z-10">#</TableHead>
                    <TableHead className="w-10 sticky top-0 bg-card z-10"></TableHead>
                    {TARGET_FIELDS.map(f => (
                      <TableHead key={f.key} className="text-xs sticky top-0 bg-card z-10">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const isExcluded = !row.selected;
                    return (
                      <TableRow
                        key={idx}
                        className={cn(
                          "text-xs",
                          isExcluded && "bg-muted/30",
                          !isExcluded && row.status === "warning" && "bg-amber-50",
                          !isExcluded && row.status === "error" && "bg-red-50/30",
                        )}
                        style={isExcluded ? { opacity: 0.55 } : undefined}
                      >
                        <TableCell>
                          <Checkbox checked={row.selected} onCheckedChange={() => toggleRow(idx)} disabled={row.status === "error"} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.rawIdx + 1}</TableCell>
                        <TableCell>
                          {row.status === "valid" && row.selected && <Check className="h-3.5 w-3.5 text-green-600" />}
                          {row.status === "warning" && (
                            <Tooltip>
                              <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
                              <TooltipContent>Duplicitní Kód Prvku — již existuje v projektu</TooltipContent>
                            </Tooltip>
                          )}
                          {row.status === "error" && (
                            <Tooltip>
                              <TooltipTrigger><X className="h-3.5 w-3.5 text-red-500" style={{ opacity: 1 }} /></TooltipTrigger>
                              <TooltipContent>Chybí povinné pole (Kód Prvku nebo Název Prvku)</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        {TARGET_FIELDS.map(f => (
                          <TableCell key={f.key} className={cn(
                            f.key === "nazev_prvku" && "font-semibold",
                            f.key === "item_name" && "max-w-[300px] truncate",
                          )}>
                            {row.values[f.key] ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ─── STEP 4: Result ─────────────────────────────── */}
        {step === 4 && importResult && (
          <div className="max-w-xl mx-auto mt-8 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Importováno", value: importResult.imported, color: "border-green-300 bg-green-50 text-green-800" },
                { label: "Varování", value: importResult.warnings, color: "border-orange-300 bg-orange-50 text-orange-800" },
                { label: "Přeskočeno", value: importResult.skipped, color: "border-muted bg-muted/30 text-muted-foreground" },
              ].map(c => (
                <Card key={c.label} className={cn("border", c.color)}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{c.value}</p>
                    <p className="text-xs mt-1">{c.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
              ✓ Import dokončen — {importResult.imported} položek úspěšně importováno
            </div>

            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={reset}>Importovat další soubor</Button>
              <Button onClick={onClose}>Zavřít</Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(o) => { if (!o) setCancelConfirmOpen(false); }}>
        <AlertDialogContent className="z-[100001]">
          <AlertDialogHeader>
            <AlertDialogTitle>Zrušit import?</AlertDialogTitle>
            <AlertDialogDescription>Opravdu chcete zrušit import? Nahraná data budou ztracena.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelConfirmOpen(false)}>Zpět</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Zrušit import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
