/**
 * MaterialImportDialog — Excel import flow.
 *
 * Steps:
 *   1) Vyber projekt (pre lookup item_code → tpv_item_id)
 *   2) Drop / pick Excel
 *   3) Preview rows + errors → Import
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useBulkInsertMaterials } from "../hooks";
import {
  parseExcelFile,
  validateImportRows,
  downloadImportTemplate,
} from "../api/excel";
import type {
  MaterialImportError,
  MaterialImportPreview,
} from "../types";

interface ProjectOption {
  project_id: string;
  project_name: string | null;
  klient: string | null;
}

interface MaterialImportDialogProps {
  open: boolean;
  onClose: () => void;
  initialProjectId?: string;
}

export function MaterialImportDialog({
  open,
  onClose,
  initialProjectId,
}: MaterialImportDialogProps) {
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MaterialImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectsQ = useQuery({
    queryKey: ["tpv", "material", "projects-active"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name, klient, is_active")
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return ((data as ProjectOption[]) ?? []).map((p) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        klient: p.klient,
      }));
    },
    enabled: open,
    staleTime: 60_000,
  });

  const bulkInsert = useBulkInsertMaterials();

  // reset state on open
  useEffect(() => {
    if (open) {
      setProjectId(initialProjectId ?? "");
      setFile(null);
      setPreview(null);
      setParseError(null);
    }
  }, [open, initialProjectId]);

  // re-parse when project or file changes
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!file || !projectId) {
        setPreview(null);
        return;
      }
      setParsing(true);
      setParseError(null);
      try {
        const raw = await parseExcelFile(file);
        const result = await validateImportRows(raw, projectId);
        if (!cancelled) setPreview(result);
      } catch (err) {
        if (!cancelled)
          setParseError(
            err instanceof Error ? err.message : "Chyba pri čítaní súboru"
          );
      } finally {
        if (!cancelled) setParsing(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [file, projectId]);

  function pickFile() {
    fileInputRef.current?.click();
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    e.target.value = ""; // allow re-pick same file
  }

  const fatalCount = preview
    ? preview.errors.filter((e) => isFatal(e, preview)).length
    : 0;
  const insertCount = preview
    ? preview.rows.filter((r) => preview.resolvedItemIds[r.rowIndex]).length
    : 0;

  async function handleImport() {
    if (!preview || !projectId) return;
    const inserts = preview.rows
      .map((r) => {
        const itemId = preview.resolvedItemIds[r.rowIndex];
        if (!itemId) return null;
        return {
          project_id: projectId,
          tpv_item_id: itemId,
          nazov: r.nazov,
          mnozstvo: r.mnozstvo,
          jednotka: r.jednotka,
          dodavatel: r.dodavatel,
          poznamka: r.poznamka,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    if (inserts.length === 0) return;
    await bulkInsert.mutateAsync(inserts);
    onClose();
  }

  function handleClose() {
    if (parsing || bulkInsert.isPending) return;
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import materiálov z Excelu</DialogTitle>
          <DialogDescription>
            Vyber projekt a nahraj XLSX s položkami. Riadky sa načítajú
            do DB po kliknutí na &quot;Importovať&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* project select */}
          <div>
            <Label className="text-xs">Projekt *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber projekt..." />
              </SelectTrigger>
              <SelectContent>
                {projectsQ.data?.map((p) => (
                  <SelectItem key={p.project_id} value={p.project_id}>
                    {p.project_name ?? p.project_id}
                    {p.klient ? ` — ${p.klient}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* file picker */}
          <div className="rounded-lg border-2 border-dashed border-border/60 p-6 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-sm">
              {file ? (
                <span className="font-mono">{file.name}</span>
              ) : (
                <span className="text-muted-foreground">
                  Žiadny súbor zatiaľ nevybraný
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={pickFile}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Vybrať Excel
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadImportTemplate()}
              >
                Šablóna
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              className="hidden"
            />
          </div>

          {/* parse status */}
          {parseError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {parseError}
            </div>
          )}
          {parsing && (
            <div className="text-sm text-muted-foreground">Spracovávam...</div>
          )}

          {/* preview */}
          {preview && !parsing && (
            <PreviewBlock preview={preview} />
          )}
        </div>

        <DialogFooter className="flex items-center gap-2">
          {preview && (
            <div className="mr-auto text-xs text-muted-foreground">
              {insertCount} pripravené · {fatalCount} chýb
            </div>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={bulkInsert.isPending}
          >
            Zavrieť
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !preview ||
              insertCount === 0 ||
              bulkInsert.isPending ||
              parsing
            }
          >
            {bulkInsert.isPending
              ? "Importujem..."
              : `Importovať ${insertCount} položiek`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Preview block
// ============================================================

function isFatal(
  err: MaterialImportError,
  preview: MaterialImportPreview
): boolean {
  // any error referencing a row that has no resolved item is fatal for that row
  if (err.field === "general") return true;
  return !preview.resolvedItemIds[err.rowIndex];
}

function PreviewBlock({ preview }: { preview: MaterialImportPreview }) {
  const fatalErrors = preview.errors.filter((e) => isFatal(e, preview));
  return (
    <div className="rounded-md border border-border/60 max-h-[320px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1 text-left w-10">#</th>
            <th className="px-2 py-1 text-left">Prvok</th>
            <th className="px-2 py-1 text-left">Materiál</th>
            <th className="px-2 py-1 text-right">Množ.</th>
            <th className="px-2 py-1 text-left">MJ</th>
            <th className="px-2 py-1 text-left">Dodávateľ</th>
            <th className="px-2 py-1 text-left">Stav</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((r) => {
            const ok = !!preview.resolvedItemIds[r.rowIndex];
            return (
              <tr
                key={r.rowIndex}
                className={
                  ok
                    ? "border-t border-border/40"
                    : "border-t border-destructive/30 bg-destructive/5"
                }
              >
                <td className="px-2 py-1 text-muted-foreground font-mono">
                  {r.rowIndex}
                </td>
                <td className="px-2 py-1 font-mono">{r.item_code}</td>
                <td className="px-2 py-1">{r.nazov}</td>
                <td className="px-2 py-1 text-right">{r.mnozstvo ?? "—"}</td>
                <td className="px-2 py-1">{r.jednotka ?? "—"}</td>
                <td className="px-2 py-1">{r.dodavatel ?? "—"}</td>
                <td className="px-2 py-1">
                  {ok ? (
                    <span className="text-emerald-300">OK</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      preskočiť
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {fatalErrors.length > 0 && (
        <div className="border-t border-border/60 bg-destructive/5 p-2">
          <div className="text-[11px] uppercase tracking-wide text-destructive font-semibold mb-1">
            Chyby
          </div>
          <ul className="text-[11px] text-destructive space-y-0.5">
            {fatalErrors.slice(0, 8).map((e, i) => (
              <li key={i}>
                <span className="font-mono">
                  riadok {e.rowIndex || "?"}
                </span>
                : {e.message}
              </li>
            ))}
            {fatalErrors.length > 8 && (
              <li className="opacity-70">
                + ďalších {fatalErrors.length - 8}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
