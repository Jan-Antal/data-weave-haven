import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      // reset
      setDateTo(undefined);
      setOpenEnded(false);
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Od</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "d. M. yyyy") : "Vyber"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Do</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={openEnded}
                    className={cn("w-full justify-start text-left font-normal mt-1", !dateTo && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {openEnded ? "otevřeno" : dateTo ? format(dateTo, "d. M. yyyy") : "Vyber"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="open-ended" checked={openEnded} onCheckedChange={v => setOpenEnded(!!v)} />
            <Label htmlFor="open-ended" className="text-sm cursor-pointer">
              Otevřeno (vygeneruje 6 měsíců dopředu, lze prodloužit)
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
