import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { Plus, Minus, RefreshCw, Loader2 } from "lucide-react";
import type { CNDiffResult, CNDiffEntry } from "@/hooks/useCNDiff";

interface Props {
  open: boolean;
  onClose: () => void;
  diff: CNDiffResult;
  projectId: string;
  currency?: string;
}

export function CNDiffDialog({ open, onClose, diff, projectId, currency = "CZK" }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(diff.entries.map((_, i) => i)));
  const [applying, setApplying] = useState(false);

  const added = useMemo(() => diff.entries.filter((e) => e.type === "added"), [diff]);
  const changed = useMemo(() => diff.entries.filter((e) => e.type === "changed"), [diff]);
  const removed = useMemo(() => diff.entries.filter((e) => e.type === "removed"), [diff]);

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === diff.entries.length) setSelected(new Set());
    else setSelected(new Set(diff.entries.map((_, i) => i)));
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      const selectedEntries = diff.entries.filter((_, i) => selected.has(i));

      // Insert new items
      const toInsert = selectedEntries
        .filter((e): e is Extract<CNDiffEntry, { type: "added" }> => e.type === "added")
        .map((e) => ({
          project_id: projectId,
          item_name: e.extracted.kod_prvku,
          nazev: e.extracted.nazev,
          popis: e.extracted.popis || null,
          cena: e.extracted.cena,
          pocet: e.extracted.pocet,
          status: "Ke zpracování",
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("tpv_items").insert(toInsert);
        if (error) throw error;
      }

      // Update changed items
      const toUpdate = selectedEntries.filter(
        (e): e is Extract<CNDiffEntry, { type: "changed" }> => e.type === "changed"
      );

      for (const entry of toUpdate) {
        const updates: Record<string, any> = {};
        for (const ch of entry.changes) {
          updates[ch.field] = ch.newVal;
        }
        const { error } = await supabase.from("tpv_items").update(updates).eq("id", entry.current.id);
        if (error) throw error;
      }

      // Soft-delete removed items
      const toRemove = selectedEntries.filter(
        (e): e is Extract<CNDiffEntry, { type: "removed" }> => e.type === "removed"
      );

      if (toRemove.length > 0) {
        const ids = toRemove.map((e) => e.current.id);
        const { error } = await supabase
          .from("tpv_items")
          .update({ deleted_at: new Date().toISOString() } as any)
          .in("id", ids);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({
        title: "Změny aplikovány",
        description: `${toInsert.length} přidáno, ${toUpdate.length} aktualizováno, ${toRemove.length} odstraněno`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: "Chyba při aplikaci změn", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const formatField = (field: string) => {
    switch (field) {
      case "cena": return "Cena";
      case "pocet": return "Počet";
      case "nazev": return "Název";
      default: return field;
    }
  };

  const formatValue = (field: string, val: string | number) => {
    if (field === "cena") return formatCurrency(Number(val), currency);
    return String(val);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Kontrola CN — {diff.sourceName}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground mb-2">
          Nalezeno {diff.entries.length} rozdílů mezi cenovou nabídkou a aktuálním TPV seznamem.
        </div>

        <div className="flex-1 overflow-auto border rounded">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === diff.entries.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-10">Typ</TableHead>
                <TableHead>Kód prvku</TableHead>
                <TableHead>Detail změny</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {added.map((entry) => {
                const idx = diff.entries.indexOf(entry);
                return (
                  <TableRow key={`a-${idx}`} className="bg-green-50/50">
                    <TableCell>
                      <Checkbox checked={selected.has(idx)} onCheckedChange={() => toggle(idx)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
                        <Plus className="h-3 w-3" /> Nový
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{entry.extracted.kod_prvku}</TableCell>
                    <TableCell className="text-xs">
                      {entry.extracted.nazev}
                      {entry.extracted.cena > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          {formatCurrency(entry.extracted.cena, currency)} × {entry.extracted.pocet}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {changed.map((entry) => {
                if (entry.type !== "changed") return null;
                const idx = diff.entries.indexOf(entry);
                return (
                  <TableRow key={`c-${idx}`} className="bg-amber-50/50">
                    <TableCell>
                      <Checkbox checked={selected.has(idx)} onCheckedChange={() => toggle(idx)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-1">
                        <RefreshCw className="h-3 w-3" /> Změna
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{entry.extracted.kod_prvku}</TableCell>
                    <TableCell className="text-xs space-y-0.5">
                      {entry.changes.map((ch, ci) => (
                        <div key={ci}>
                          <span className="font-medium">{formatField(ch.field)}:</span>{" "}
                          <span className="line-through text-muted-foreground">{formatValue(ch.field, ch.oldVal)}</span>
                          {" → "}
                          <span className="font-semibold text-amber-700">{formatValue(ch.field, ch.newVal)}</span>
                        </div>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}

              {removed.map((entry) => {
                if (entry.type !== "removed") return null;
                const idx = diff.entries.indexOf(entry);
                return (
                  <TableRow key={`r-${idx}`} className="bg-red-50/50">
                    <TableCell>
                      <Checkbox checked={selected.has(idx)} onCheckedChange={() => toggle(idx)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs gap-1">
                        <Minus className="h-3 w-3" /> Chybí
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{entry.current.item_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.current.nazev || ""}
                      {(entry.current.cena ?? 0) > 0 && (
                        <span className="ml-2">
                          {formatCurrency(entry.current.cena ?? 0, currency)} × {entry.current.pocet ?? 1}
                        </span>
                      )}
                      <span className="ml-2 text-red-600">— v CN nenalezeno</span>
                    </TableCell>
                  </TableRow>
                );
              })}

              {diff.entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    Žádné rozdíly — TPV odpovídá cenové nabídce ✓
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Zavřít
          </Button>
          {diff.entries.length > 0 && (
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying || selected.size === 0}
            >
              {applying ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Aplikuji…</>
              ) : (
                `Aktualizovat vybrané (${selected.size})`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
