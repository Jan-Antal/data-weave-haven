import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExchangeRates, useUpdateExchangeRate, useAddExchangeRate, useDeleteExchangeRate } from "@/hooks/useExchangeRates";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExchangeRateSettings({ open, onOpenChange }: Props) {
  const { data: rates = [], isLoading } = useExchangeRates();
  const updateRate = useUpdateExchangeRate();
  const addRate = useAddExchangeRate();
  const deleteRate = useDeleteExchangeRate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [newRate, setNewRate] = useState("25.00");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleStartEdit = (id: string, currentValue: number) => {
    setEditingId(id);
    setEditValue(String(currentValue));
  };

  const handleSaveEdit = (id: string) => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val > 0) {
      updateRate.mutate({ id, eur_czk: val });
    }
    setEditingId(null);
  };

  const handleAdd = () => {
    const y = parseInt(newYear);
    const r = parseFloat(newRate);
    if (!isNaN(y) && !isNaN(r) && y > 2000 && r > 0) {
      addRate.mutate({ year: y, eur_czk: r });
      setAddOpen(false);
      setNewYear("");
      setNewRate("25.00");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kurzovní lístek — EUR / CZK</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5">
                  <TableHead className="font-semibold">Rok</TableHead>
                  <TableHead className="font-semibold">Kurz EUR/CZK</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">Načítání...</TableCell>
                  </TableRow>
                ) : rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-mono text-sm">{rate.year}</TableCell>
                    <TableCell>
                      {editingId === rate.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(rate.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(rate.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="h-7 text-sm w-24 no-spinners"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 text-sm"
                          onClick={() => handleStartEdit(rate.id, rate.eur_czk)}
                        >
                          {Number(rate.eur_czk).toFixed(2)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(rate.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => {
            setNewYear(String(new Date().getFullYear() + 1));
            setNewRate("25.00");
            setAddOpen(true);
          }}>
            <Plus className="h-3 w-3 mr-1" /> Přidat rok
          </Button>
        </DialogContent>
      </Dialog>

      {/* Add Year Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Přidat rok</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-sm font-medium">Rok</label>
              <Input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} className="no-spinners" />
            </div>
            <div>
              <label className="text-sm font-medium">Kurz EUR/CZK</label>
              <Input type="number" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="no-spinners" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAdd}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={() => { if (deleteId) { deleteRate.mutate({ id: deleteId }); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
