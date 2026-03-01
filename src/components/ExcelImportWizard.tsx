import { useState, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Check, AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
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

// ── Target fields: ONLY columns that exist in tpv_items table ────
const TARGET_FIELDS = [
  { key: "item_name", label: "Název položky", required: true },
  { key: "item_type", label: "Typ" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "status", label: "Status" },
  { key: "sent_date", label: "Odesláno" },
  { key: "accepted_date", label: "Přijato" },
  { key: "notes", label: "Poznámka" },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

// ── Fuzzy matching keywords ───────────────────────────────────────
const FUZZY_MAP: { keywords: string[]; target: TargetKey }[] = [
  { keywords: ["nazev", "název", "name", "položka", "polozka", "item"], target: "item_name" },
  { keywords: ["typ", "type", "druh"], target: "item_type" },
  { keywords: ["konstrukter", "konstruktér", "designer"], target: "konstrukter" },
  { keywords: ["status", "stav"], target: "status" },
  { keywords: ["odeslano", "odesláno", "sent"], target: "sent_date" },
  { keywords: ["prijato", "přijato", "accepted"], target: "accepted_date" },
  { keywords: ["poznamka", "poznámka", "note", "notes"], target: "notes" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function fuzzyMatch(header: string): TargetKey | null {
  const n = normalize(header);
  for (const { keywords, target } of FUZZY_MAP) {
    if (keywords.some(k => n.includes(k))) return target;
  }
  return null;
}

function colLetter(i: number): string {
  let s = "";
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// ── Subtotal/header row detection ─────────────────────────────────
const SKIP_PATTERNS = ["---", "mezisoučet", "mezisoucet", "celkem", "total", "subtotal", "součet", "soucet"];

function isSkipRow(row: any[], nameIdx: number | null): boolean {
  const nameVal = nameIdx !== null ? String(row[nameIdx] ?? "").trim() : "";
  if (!nameVal) return true;
  const n = normalize(nameVal);
  if (SKIP_PATTERNS.some(p => n.includes(p))) return true;
  if (nameVal === nameVal.toUpperCase() && nameVal.length > 3 && !/\d/.test(nameVal)) return true;
  return false;
}

function formatCzNumber(v: number): string {
  return new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
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

type Mapping = Record<number, TargetKey | "__skip__">;

interface RowData {
  values: Record<TargetKey, string>;
  selected: boolean;
  status: "valid" | "warning" | "error";
  rawIdx: number;
}

export function ExcelImportWizard({ projectId, projectName, open, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [uploadTime, setUploadTime] = useState<Date | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [activeSheet, setActiveSheet] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});

  // Step 3 state
  const [rows, setRows] = useState<RowData[]>([]);

  // Step 4 state
  const [importResult, setImportResult] = useState<{ imported: number; warnings: number; skipped: number; totalValue: number } | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Cancel handler ──────────────────────────────────────────
  const handleCancel = () => {
    if (file) {
      setCancelConfirmOpen(true);
    } else {
      onClose();
    }
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
        const autoMap: Mapping = {};
        const used = new Set<TargetKey>();
        parsed[0].headers.forEach((h, i) => {
          const match = fuzzyMatch(h);
          if (match && !used.has(match)) {
            autoMap[i] = match;
            used.add(match);
          }
        });
        setMapping(autoMap);
        setActiveSheet(0);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const removeFile = () => {
    setFile(null);
    setSheets([]);
    setMapping({});
    setUploadTime(null);
  };

  // ── Step 2: Mapping ─────────────────────────────────────────
  const currentSheet = sheets[activeSheet];
  const mappedCount = Object.values(mapping).filter(v => v !== "__skip__").length;
  const totalCols = currentSheet?.headers.length ?? 0;
  const hasNameMapped = Object.values(mapping).includes("item_name");

  const setMappingForCol = (colIdx: number, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (value === "__skip__" || value === "") {
        delete next[colIdx];
      } else {
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === value) delete next[Number(k)];
        }
        next[colIdx] = value as TargetKey;
      }
      return next;
    });
  };

  const usedTargets = useMemo(() => new Set(Object.values(mapping).filter(v => v !== "__skip__")), [mapping]);

  const handleSheetChange = (idx: number) => {
    setActiveSheet(idx);
    const sheet = sheets[idx];
    if (!sheet) return;
    const autoMap: Mapping = {};
    const used = new Set<TargetKey>();
    sheet.headers.forEach((h, i) => {
      const match = fuzzyMatch(h);
      if (match && !used.has(match)) {
        autoMap[i] = match;
        used.add(match);
      }
    });
    setMapping(autoMap);
  };

  // ── Step 2 → 3: Build rows (filter empty) ──────────────────
  const buildRows = () => {
    if (!currentSheet) return;
    const nameColIdx = Object.entries(mapping).find(([, v]) => v === "item_name")?.[0];
    const nameIdx = nameColIdx !== undefined ? Number(nameColIdx) : null;
    const mappedColIndices = Object.entries(mapping)
      .filter(([, v]) => v !== "__skip__")
      .map(([k]) => Number(k));

    const built: RowData[] = [];
    for (let rawIdx = 0; rawIdx < currentSheet.rows.length; rawIdx++) {
      const row = currentSheet.rows[rawIdx];
      // Filter: skip rows where ALL mapped columns are empty
      const hasAnyData = mappedColIndices.some(ci => {
        const v = String(row[ci] ?? "").trim();
        return v !== "";
      });
      if (!hasAnyData) continue;

      const values: Record<string, string> = {} as any;
      for (const [colIdxStr, target] of Object.entries(mapping)) {
        if (target === "__skip__") continue;
        values[target] = String(row[Number(colIdxStr)] ?? "").trim();
      }
      const skip = isSkipRow(row, nameIdx);
      const hasName = !!values.item_name;
      const status: "valid" | "warning" | "error" = !hasName ? "error" : "valid";
      built.push({ values: values as Record<TargetKey, string>, selected: !skip && hasName, status, rawIdx });
    }
    setRows(built);
  };

  // ── Step 3: Stats ───────────────────────────────────────────
  const stats = useMemo(() => {
    const selected = rows.filter(r => r.selected);
    const skipped = rows.length - selected.length;
    const warnings = selected.filter(r => r.status === "warning").length;
    const errors = rows.filter(r => r.status === "error" && r.selected).length;
    return { selected: selected.length, skipped, warnings, errors, totalValue: 0 };
  }, [rows]);

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = (val: boolean) => {
    setRows(prev => prev.map(r => r.status !== "error" ? { ...r, selected: val } : r));
  };

  // ── Step 3 → 4: Import ─────────────────────────────────────
  const doImport = async () => {
    const toImport = rows.filter(r => r.selected);
    if (!toImport.length) return;
    setImporting(true);

    const items = toImport.map(r => ({
      project_id: projectId,
      item_name: r.values.item_name || "Bez názvu",
      item_type: r.values.item_type || null,
      konstrukter: r.values.konstrukter || null,
      status: r.values.status || null,
      sent_date: r.values.sent_date || null,
      accepted_date: r.values.accepted_date || null,
      notes: r.values.notes || null,
      imported_at: new Date().toISOString(),
      import_source: file?.name || null,
    }));

    try {
      const { error } = await supabase.from("tpv_items").insert(items as any);
      if (error) throw error;

      const warnings = toImport.filter(r => r.status === "warning").length;
      setImportResult({
        imported: toImport.length,
        warnings,
        skipped: rows.length - toImport.length,
        totalValue: stats.totalValue,
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
    setMapping({});
    setRows([]);
    setImportResult(null);
    setUploadTime(null);
  };

  if (!open) return null;

  // ── Mapped field keys for preview table ─────────────────────
  const mappedFields = Object.entries(mapping)
    .filter(([, v]) => v !== "__skip__")
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v as TargetKey);

  const fieldLabel = (key: TargetKey) => TARGET_FIELDS.find(f => f.key === key)?.label ?? key;

  // ── Stepper ─────────────────────────────────────────────────
  const STEPS = ["Nahrání souboru", "Mapování sloupců", "Náhled & výběr", "Import"];

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col" style={{ background: "#f5f3ef" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 shadow-sm" style={{ background: "#2d3b2d", color: "white" }}>
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5" />
          <span className="font-semibold">Import Excel — {projectId}</span>
          <span className="text-sm opacity-70">{projectName}</span>
        </div>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={handleCancel}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center py-4 px-6 gap-0">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          return (
            <div key={i} className="flex items-center">
              {i > 0 && (
                <div className={cn("w-12 h-0.5 mx-1", isComplete ? "bg-green-600" : "bg-gray-300")} />
              )}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  isComplete && "bg-green-600 border-green-600 text-white",
                  isActive && "bg-[#2d3b2d] border-[#2d3b2d] text-white",
                  !isComplete && !isActive && "border-gray-300 text-gray-400",
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
        {/* ─── STEP 1 ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="max-w-xl mx-auto mt-8">
            <Card>
              <CardContent className="p-8">
                {!file ? (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-green-500 hover:bg-green-50/30 transition-colors"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium text-sm">Přetáhněte soubor sem</p>
                    <p className="text-xs text-muted-foreground mt-1">nebo klikněte pro výběr • .xlsx, .xls, .csv</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
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
          </div>
        )}

        {/* ─── STEP 2 ─────────────────────────────────────── */}
        {step === 2 && currentSheet && (
          <div className="max-w-3xl mx-auto mt-4 space-y-4">
            {sheets.length > 1 && (
              <div className="flex gap-1">
                {sheets.map((s, i) => (
                  <Button
                    key={i}
                    variant={activeSheet === i ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSheetChange(i)}
                    className="text-xs"
                  >
                    List {i + 1} — {s.name}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
              <Check className="h-3.5 w-3.5" />
              Automaticky rozpoznáno {mappedCount} z {totalCols} sloupců
            </div>

            <Card>
              <CardContent className="p-4 space-y-2">
                {currentSheet.headers.map((header, colIdx) => {
                  const val = mapping[colIdx] || "__skip__";
                  const isMapped = val !== "__skip__";
                  return (
                    <div
                      key={colIdx}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md border transition-colors",
                        isMapped ? "border-green-300 bg-green-50/50" : "border-gray-200 bg-gray-50/50",
                      )}
                    >
                      <span className="w-7 h-7 rounded bg-gray-200 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {colLetter(colIdx)}
                      </span>
                      <span className="text-sm font-medium flex-1 truncate">{header || "(prázdný)"}</span>
                      <div className="flex items-center gap-2">
                        {isMapped ? (
                          <span className="text-green-600"><Check className="h-4 w-4" /></span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-400 uppercase">SKIP</span>
                        )}
                        <Select value={val} onValueChange={v => setMappingForCol(colIdx, v)}>
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[100001]">
                            <SelectItem value="__skip__">— Přeskočit —</SelectItem>
                            {TARGET_FIELDS.map(f => (
                              <SelectItem key={f.key} value={f.key} disabled={usedTargets.has(f.key) && mapping[colIdx] !== f.key}>
                                {f.label}{"required" in f && f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {!hasNameMapped && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Pole "Název položky" je povinné pro pokračování
              </div>
            )}

            <div className="flex justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Zpět
                </Button>
                <Button variant="outline" onClick={handleCancel}>Zrušit</Button>
              </div>
              <Button onClick={() => { buildRows(); setStep(3); }} disabled={!hasNameMapped}>
                Pokračovat na náhled <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3 ─────────────────────────────────────── */}
        {step === 3 && (
          <>
            {/* Sticky stats + actions bar */}
            <div className="sticky top-0 z-10 bg-[#f5f3ef] pb-2 space-y-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Vybrané", value: stats.selected, color: "text-green-700 bg-green-50 border-green-200" },
                    { label: "Přeskočené", value: stats.skipped, color: "text-gray-600 bg-gray-50 border-gray-200" },
                    { label: "Varování", value: stats.warnings, color: "text-orange-700 bg-orange-50 border-orange-200" },
                    { label: "Chyby", value: stats.errors, color: "text-red-700 bg-red-50 border-red-200" },
                  ].map(s => (
                    <div key={s.label} className={cn("px-3 py-1.5 rounded-md border text-xs font-medium", s.color)}>
                      {s.label}: {s.value}
                    </div>
                  ))}
                  {stats.totalValue > 0 && (
                    <div className="px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">
                      Celkem: {formatCzNumber(stats.totalValue)} Kč
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Zpět na mapování
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancel}>Zrušit</Button>
                  <Button size="sm" onClick={doImport} disabled={importing || stats.selected === 0}>
                    {importing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importuji {stats.selected} položek...</>
                    ) : (
                      <>Importovat {stats.selected} řádků <ChevronRight className="h-4 w-4 ml-1" /></>
                    )}
                  </Button>
                </div>
              </div>

              {stats.errors > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-md text-xs text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {stats.errors} řádků má chyby (chybí povinná pole)
                </div>
              )}
            </div>

            {/* Scrollable table */}
            <div className="flex-1 overflow-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 sticky top-0 bg-card z-10">
                      <Checkbox
                        checked={rows.filter(r => r.status !== "error").every(r => r.selected)}
                        onCheckedChange={(v) => selectAll(!!v)}
                      />
                    </TableHead>
                    <TableHead className="w-10 sticky top-0 bg-card z-10">#</TableHead>
                    <TableHead className="w-10 sticky top-0 bg-card z-10"></TableHead>
                    {mappedFields.map(f => {
                      const isName = f === "item_name";
                      return (
                        <TableHead
                          key={f}
                          className={cn(
                            "text-xs sticky top-0 bg-card z-10",
                            isName && "max-w-[400px]",
                          )}
                          style={isName ? { maxWidth: 400 } : undefined}
                        >
                          {fieldLabel(f)}
                        </TableHead>
                      );
                    })}
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
                          isExcluded && "bg-gray-50",
                          !isExcluded && row.status === "warning" && "bg-yellow-50",
                          !isExcluded && row.status === "error" && "bg-red-50/30",
                        )}
                        style={isExcluded ? { opacity: 0.55 } : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={row.selected}
                            onCheckedChange={() => toggleRow(idx)}
                            disabled={row.status === "error"}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.rawIdx + 1}</TableCell>
                        <TableCell>
                          {row.status === "valid" && row.selected && <Check className="h-3.5 w-3.5 text-green-600" />}
                          {row.status === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                          {row.status === "error" && <X className="h-3.5 w-3.5 text-red-500" style={{ opacity: 1 }} />}
                        </TableCell>
                        {mappedFields.map(f => {
                          const val = row.values[f] ?? "";
                          const isName = f === "item_name";
                          return (
                            <TableCell
                              key={f}
                              className={cn(
                                isName && "max-w-[400px] truncate",
                              )}
                              style={isName ? { maxWidth: 400 } : undefined}
                            >
                              {val}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ─── STEP 4 ─────────────────────────────────────── */}
        {step === 4 && importResult && (
          <div className="max-w-xl mx-auto mt-8 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Položek importováno", value: importResult.imported, color: "border-green-300 bg-green-50 text-green-800" },
                { label: "S varováním", value: importResult.warnings, color: "border-orange-300 bg-orange-50 text-orange-800" },
                { label: "Přeskočeno", value: importResult.skipped, color: "border-gray-300 bg-gray-50 text-gray-600" },
              ].map(c => (
                <Card key={c.label} className={cn("border", c.color)}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{c.value}</p>
                    <p className="text-xs mt-1">{c.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {importResult.totalValue > 0 && (
              <div className="text-center p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                ✓ Import dokončen — celková hodnota: <strong>{formatCzNumber(importResult.totalValue)} Kč</strong>
              </div>
            )}
            {importResult.totalValue === 0 && (
              <div className="text-center p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                ✓ Import dokončen — {importResult.imported} položek úspěšně importováno
              </div>
            )}

            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={reset}>
                Importovat další soubor
              </Button>
              <Button onClick={onClose}>
                Zavřít
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel confirmation — must be above wizard z-index */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={(o) => { if (!o) setCancelConfirmOpen(false); }}>
        <AlertDialogContent className="z-[100001]">
          <AlertDialogHeader>
            <AlertDialogTitle>Zrušit import?</AlertDialogTitle>
            <AlertDialogDescription>Opravdu chcete zrušit import? Nahraná data budou ztracena.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelConfirmOpen(false)}>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Smazat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
