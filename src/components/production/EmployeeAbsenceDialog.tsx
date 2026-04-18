import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCreateAbsencePeriod } from "@/hooks/useEmployeeAbsences";
import { toast } from "@/hooks/use-toast";

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

export function EmployeeAbsenceDialog({ open, onOpenChange, employeeId, employeeName }: Props) {
  const [kod, setKod] = useState("RD");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [openEnded, setOpenEnded] = useState(false);
  const [activePicker, setActivePicker] = useState<"from" | "to">("from");
  const create = useCreateAbsencePeriod();

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
      await create.mutateAsync({
        employee_id: employeeId,
        absencia_kod: kod,
        date_from: format(dateFrom, "yyyy-MM-dd"),
        date_to: openEnded ? null : format(dateTo!, "yyyy-MM-dd"),
      });
      toast({ title: "Absence přidána", description: `${employeeName} — ${kod}` });
      onOpenChange(false);
      setDateTo(undefined);
      setOpenEnded(false);
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Přidat absenci — {employeeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          {/* Inline date picker tabs */}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? "Ukládám..." : "Uložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
