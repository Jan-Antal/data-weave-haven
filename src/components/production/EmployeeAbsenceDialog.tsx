import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useCreateAbsencePeriod,
  useDeleteAbsencePeriod,
  useManualAbsences,
  type AbsencePeriod,
} from "@/hooks/useEmployeeAbsences";
import { toast } from "@/hooks/use-toast";
import { Pencil, Trash2, X } from "lucide-react";

export const ABSENCE_KODY: Array<{ value: string; label: string }> = [
  { value: "DOV", label: "DOV — Dovolená" },
  { value: "NEM", label: "NEM — Nemocenská" },
  { value: "RD",  label: "RD — Rodičovská" },
  { value: "PN",  label: "PN — Pracovní neschopnost" },
  { value: "OCR", label: "OCR — Ošetřování člena rodiny" },
  { value: "OTHER", label: "Jiné" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  employeeName: string;
}

const SIX_MONTHS_DAYS = 170; // matches hook's open-ended fill window

export function EmployeeAbsenceDialog({ open, onOpenChange, employeeId, employeeName }: Props) {
  const [kod, setKod] = useState("RD");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [openEnded, setOpenEnded] = useState(false);
  const [activePicker, setActivePicker] = useState<"from" | "to">("from");
  const [editingId, setEditingId] = useState<string | null>(null); // first id of period being edited

  const create = useCreateAbsencePeriod();
  const del = useDeleteAbsencePeriod();
  const { data: allPeriods = [] } = useManualAbsences();

  const employeePeriods = useMemo(
    () => allPeriods
      .filter(p => p.employee_id === employeeId)
      .sort((a, b) => b.date_from.localeCompare(a.date_from)),
    [allPeriods, employeeId],
  );

  const resetForm = () => {
    setKod("RD");
    setDateFrom(new Date());
    setDateTo(undefined);
    setOpenEnded(false);
    setActivePicker("from");
    setEditingId(null);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const startEdit = (p: AbsencePeriod) => {
    const fromD = new Date(p.date_from + "T00:00:00");
    const toD = new Date(p.date_to + "T00:00:00");
    const days = (toD.getTime() - fromD.getTime()) / 86400000;
    const isOpenEnded = days >= SIX_MONTHS_DAYS;

    setKod(p.absencia_kod);
    setDateFrom(fromD);
    setDateTo(isOpenEnded ? undefined : toD);
    setOpenEnded(isOpenEnded);
    setActivePicker(isOpenEnded ? "from" : "to");
    setEditingId(p.ids[0]);
  };

  const editingPeriod = editingId
    ? employeePeriods.find(p => p.ids[0] === editingId) ?? null
    : null;

  const handleDelete = async (p: AbsencePeriod) => {
    const from = format(new Date(p.date_from + "T00:00:00"), "d. M. yyyy", { locale: cs });
    const to = format(new Date(p.date_to + "T00:00:00"), "d. M. yyyy", { locale: cs });
    if (!confirm(`Smazat absenci ${p.absencia_kod} (${from} → ${to})?`)) return;
    try {
      await del.mutateAsync(p.ids);
      toast({ title: "Absence smazána" });
      if (editingId === p.ids[0]) resetForm();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!dateFrom) {
      toast({ title: "Chybí datum od", variant: "destructive" });
      return;
    }
    if (!openEnded && !dateTo) {
      toast({ title: "Vyber datum do nebo zaškrtni 'otevřeno'", variant: "destructive" });
      return;
    }
    try {
      // If editing, delete the old period first, then re-create with new values.
      if (editingPeriod) {
        await del.mutateAsync(editingPeriod.ids);
      }
      await create.mutateAsync({
        employee_id: employeeId,
        absencia_kod: kod,
        date_from: format(dateFrom, "yyyy-MM-dd"),
        date_to: openEnded ? null : format(dateTo!, "yyyy-MM-dd"),
      });
      toast({
        title: editingPeriod ? "Absence upravena" : "Absence přidána",
        description: `${employeeName} — ${kod}`,
      });
      resetForm();
      // Keep dialog open after edit so user sees the updated list.
      if (!editingPeriod) onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const isPending = create.isPending || del.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Spravovat absence — {employeeName}</DialogTitle>
        </DialogHeader>

        {employeePeriods.length > 0 && (
          <div className="space-y-2 py-2">
            <Label className="text-xs">Existující absence</Label>
            <div className="border rounded-md divide-y">
              {employeePeriods.map(p => {
                const from = format(new Date(p.date_from + "T00:00:00"), "d. M. yyyy", { locale: cs });
                const to = format(new Date(p.date_to + "T00:00:00"), "d. M. yyyy", { locale: cs });
                const isEditing = editingId === p.ids[0];
                return (
                  <div
                    key={p.ids[0]}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 text-sm",
                      isEditing && "bg-primary/5",
                    )}
                  >
                    <div>
                      <span className="font-medium">{p.absencia_kod}</span>
                      <span className="text-muted-foreground ml-2">{from} → {to}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(p)}
                        disabled={isPending}
                        title="Upravit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(p)}
                        disabled={isPending}
                        title="Smazat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-4 py-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              {editingPeriod ? "Upravit absenci" : "Přidat novou absenci"}
            </Label>
            {editingPeriod && (
              <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Zrušit úpravu
              </Button>
            )}
          </div>

          <div>
            <Label className="text-xs">Typ absence</Label>
            <Select value={kod} onValueChange={setKod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABSENCE_KODY.map(k => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setActivePicker("from")}
                className={cn(
                  "border rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activePicker === "from" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <div className="text-[11px] text-muted-foreground">Od</div>
                <div className="font-medium">
                  {dateFrom ? format(dateFrom, "d. M. yyyy") : "Vyber"}
                </div>
              </button>
              <button
                type="button"
                disabled={openEnded}
                onClick={() => setActivePicker("to")}
                className={cn(
                  "border rounded-md px-3 py-2 text-left text-sm transition-colors",
                  openEnded && "opacity-50 cursor-not-allowed",
                  activePicker === "to" && !openEnded ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                )}
              >
                <div className="text-[11px] text-muted-foreground">Do</div>
                <div className="font-medium">
                  {openEnded ? "na neurčito" : dateTo ? format(dateTo, "d. M. yyyy") : "Vyber"}
                </div>
              </button>
            </div>

            <div className="border rounded-md flex justify-center">
              {activePicker === "from" ? (
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              ) : (
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  disabled={openEnded ? true : undefined}
                  className={cn("p-3 pointer-events-auto")}
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="open-ended"
              checked={openEnded}
              onCheckedChange={(v) => {
                setOpenEnded(!!v);
                if (v) setActivePicker("from");
              }}
            />
            <Label htmlFor="open-ended" className="text-sm cursor-pointer">
              Otevřeno na neurčito (lze později ukončit)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zavřít</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Ukládám..."
              : editingPeriod
                ? "Uložit změny"
                : "Přidat absenci"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
