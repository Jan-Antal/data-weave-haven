/**
 * ImportDialog — multi-step Excel import wizard.
 *
 * Steps:
 *   1. Mode picker (draft_only | with_suppliers) + template download
 *   2. File upload + parse + validate
 *   3. Preview (valid + invalid rows) → confirm import
 *   4. Result toast + auto-close
 */

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ArrowLeft,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import {
  parseExcelFile,
  buildResolveContext,
  validateImportRows,
  bulkInsertSubcontracts,
  downloadImportTemplate,
} from "../api/excel";
import type {
  ImportMode,
  ImportPreviewResult,
  ImportRowValidated,
} from "../types";
import { formatMoneyCompact } from "../helpers";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "mode" | "preview" | "importing";

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<ImportMode>("draft_only");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = useCallback(() => {
    setStep("mode");
    setParsing(false);
    setParseError(null);
    setPreview(null);
    setImporting(false);
  }, []);

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const raw = await parseExcelFile(file);
      if (raw.length === 0) {
        setParseError("Súbor neobsahuje žiadne dátové riadky.");
        setParsing(false);
        return;
      }
      const ctx = await buildResolveContext(raw);
      const result = validateImportRows(raw, ctx, mode);
      setPreview(result);
      setStep("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setParseError(`Chyba pri čítaní súboru: ${msg}`);
    } finally {
      setParsing(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // reset for re-upload of same filename
  };

  const handleImport = async () => {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    setStep("importing");
    try {
      const inserted = await bulkInsertSubcontracts(preview.valid, mode);
      qc.invalidateQueries({ queryKey: ["tpv", "subcontracts"] });
      toast.success(
        `Importovaných ${inserted.length} ${
          inserted.length === 1 ? "subdodávka" : "subdodávok"
        }`,
        {
          description:
            mode === "with_suppliers"
              ? "Subdodávky sú v stave 'awarded' a pripravené na objednávku."
              : "Subdodávky sú v stave 'draft' — doplň detaily.",
        }
      );
      handleClose(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Import zlyhal", { description: msg });
      setImporting(false);
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import subdodávok z Excelu
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {step === "mode" && (
            <ModeStep
              mode={mode}
              onModeChange={setMode}
              parsing={parsing}
              parseError={parseError}
              onTemplateDownload={() => downloadImportTemplate(mode)}
              onFileClick={() => fileInputRef.current?.click()}
            />
          )}

          {step === "preview" && preview && (
            <PreviewStep preview={preview} mode={mode} />
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium">Importujem subdodávky…</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nezatváraj okno
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          {step === "mode" && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Zrušiť
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Spracovávam…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Vybrať súbor
                  </>
                )}
              </Button>
            </>
          )}
          {step === "preview" && preview && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setStep("mode");
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Späť
              </Button>
              <Button
                onClick={handleImport}
                disabled={preview.valid.length === 0 || importing}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Importovať {preview.valid.length}{" "}
                {preview.valid.length === 1 ? "riadok" : "riadkov"}
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button variant="ghost" disabled>
              Importujem…
            </Button>
          )}
        </DialogFooter>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onFileSelected}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// STEP 1 — MODE PICKER
// ============================================================

function ModeStep({
  mode,
  onModeChange,
  parsing,
  parseError,
  onTemplateDownload,
  onFileClick,
}: {
  mode: ImportMode;
  onModeChange: (m: ImportMode) => void;
  parsing: boolean;
  parseError: string | null;
  onTemplateDownload: () => void;
  onFileClick: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-2">1. Vyber režim importu</h3>
        <div className="space-y-2">
          <ModeOption
            value="draft_only"
            current={mode}
            title="Bulk vytvor draft subdodávok"
            description="Konstrukter pripraví zoznam operácií (lakovanie 5×, sklo 4×, CNC 12×). Subdodávky sa vytvoria v stave 'draft' — PM neskôr doplní dodávateľa, cenu a termín."
            tag="Najčastejšie"
            onClick={() => onModeChange("draft_only")}
          />
          <ModeOption
            value="with_suppliers"
            current={mode}
            title="Plný import s dodávateľmi a cenami"
            description="Importujú sa kompletné záznamy aj s dodávateľmi (presný názov alebo IČO musí byť v databáze) a finálnymi cenami. Stav po importe = 'awarded'."
            onClick={() => onModeChange("with_suppliers")}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">2. Stiahni si šablónu</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onTemplateDownload}
          className="w-full justify-center"
        >
          <Download className="h-4 w-4 mr-2" />
          Stiahnuť .xlsx šablónu pre {mode === "draft_only" ? "draft" : "plný import"}
        </Button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Šablóna obsahuje hárok s inštrukciami a ukážkový riadok. Stĺpce majú
          flexibilné názvy — fungujú aj `Projekt`/`Project ID`,
          `Operácia`/`Název`, atď.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">3. Nahraj vyplnený súbor</h3>
        <button
          type="button"
          onClick={onFileClick}
          disabled={parsing}
          className={cn(
            "w-full border-2 border-dashed rounded-lg py-8 text-center hover:bg-muted/30 transition-colors",
            parsing && "opacity-50 cursor-wait"
          )}
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            {parsing ? "Spracovávam súbor…" : "Klikni alebo presuň .xlsx súbor"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Podporované formáty: .xlsx, .xls, .csv
          </p>
        </button>

        {parseError && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeOption({
  value,
  current,
  title,
  description,
  tag,
  onClick,
}: {
  value: ImportMode;
  current: ImportMode;
  title: string;
  description: string;
  tag?: string;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left border-2 rounded-lg p-4 transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
            active ? "border-primary" : "border-muted-foreground/40"
          )}
        >
          {active && <div className="w-2 h-2 rounded-full bg-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{title}</p>
            {tag && (
              <span className="text-[10px] uppercase font-bold tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// STEP 2 — PREVIEW
// ============================================================

function PreviewStep({
  preview,
  mode,
}: {
  preview: ImportPreviewResult;
  mode: ImportMode;
}) {
  const totalValid = preview.valid.length;
  const totalInvalid = preview.invalid.length;
  const validValue = preview.valid.reduce(
    (sum, r) => sum + (r.cena_predpokladana ?? 0),
    0
  );
  const warningCount = preview.valid.filter((r) => r.warnings.length > 0)
    .length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          tone={totalValid > 0 ? "good" : "neutral"}
          label="Validné"
          value={totalValid.toString()}
          sub={
            validValue > 0 ? `${formatMoneyCompact(validValue)} Kč` : undefined
          }
        />
        <SummaryCard
          tone={warningCount > 0 ? "warn" : "neutral"}
          label="S varovaním"
          value={warningCount.toString()}
          sub={warningCount > 0 ? "skontroluj" : undefined}
        />
        <SummaryCard
          tone={totalInvalid > 0 ? "bad" : "neutral"}
          label="Chybné"
          value={totalInvalid.toString()}
          sub={totalInvalid > 0 ? "neimportujú sa" : undefined}
        />
      </div>

      {/* Mode hint */}
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
        Po importe budú validné riadky v stave{" "}
        <strong>
          {mode === "with_suppliers" ? "'awarded'" : "'draft'"}
        </strong>
        .{" "}
        {mode === "with_suppliers"
          ? "Tvoj nákupca môže okamžite spustiť objednávku."
          : "PM doplní dodávateľa, cenu a termín v detaile."}
      </div>

      {/* Invalid rows first (most important) */}
      {totalInvalid > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">
            ❌ Chybné riadky ({totalInvalid}) — neimportujú sa
          </h4>
          <div className="border border-red-200 rounded-lg overflow-hidden divide-y divide-red-100 max-h-[200px] overflow-y-auto">
            {preview.invalid.map((row) => (
              <div key={row.rowNumber} className="px-3 py-2 bg-red-50 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-mono font-bold text-red-700 w-12 shrink-0">
                    R{row.rowNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground truncate">
                      {row.raw.nazov ?? "(bez názvu)"} · {row.raw.project_id ?? "(bez projektu)"}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {row.errors.map((err, i) => (
                        <li key={i} className="text-red-700">
                          • {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Valid rows preview */}
      {totalValid > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-2">
            ✓ Validné riadky ({totalValid})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium w-10">R</th>
                    <th className="text-left px-3 py-1.5 font-medium">Projekt</th>
                    <th className="text-left px-3 py-1.5 font-medium">Operácia</th>
                    <th className="text-left px-3 py-1.5 font-medium">Dodávateľ</th>
                    <th className="text-right px-3 py-1.5 font-medium">Cena</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.valid.map((row) => (
                    <ValidRow key={row.rowNumber} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ValidRow({ row }: { row: ImportRowValidated }) {
  const [showWarnings, setShowWarnings] = useState(false);
  return (
    <>
      <tr>
        <td className="px-3 py-1.5 font-mono text-muted-foreground">
          {row.rowNumber}
        </td>
        <td className="px-3 py-1.5 font-mono">{row.project_id}</td>
        <td className="px-3 py-1.5">
          <div className="font-medium truncate max-w-[200px]">{row.nazov}</div>
          {row.warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowWarnings((v) => !v)}
              className="text-amber-700 text-[10px] mt-0.5 hover:underline"
            >
              ⚠ {row.warnings.length} varovaní {showWarnings ? "▴" : "▾"}
            </button>
          )}
        </td>
        <td className="px-3 py-1.5">
          {row.dodavatel_id ? (
            <span className="text-foreground">priradený</span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {row.cena_predpokladana != null
            ? formatMoneyCompact(row.cena_predpokladana)
            : "—"}
        </td>
      </tr>
      {showWarnings && row.warnings.length > 0 && (
        <tr>
          <td colSpan={5} className="px-3 py-1.5 bg-amber-50">
            <ul className="text-amber-800 space-y-0.5 text-[11px]">
              {row.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryCard({
  tone,
  label,
  value,
  sub,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  label: string;
  value: string;
  sub?: string;
}) {
  const colors = {
    good: "border-green-200 bg-green-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
    neutral: "border-border bg-muted/20",
  };
  const valueColors = {
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-700",
    neutral: "text-foreground",
  };
  return (
    <div className={cn("border rounded-lg px-3 py-2.5", colors[tone])}>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", valueColors[tone])}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
