import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTerminateEmployee } from "@/hooks/useOsoby";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  employeeName: string;
}

export function UkoncitPracovniPomerDialog({ open, onOpenChange, employeeId, employeeName }: Props) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const terminate = useTerminateEmployee();

  const handleConfirm = async () => {
    if (!date) return;
    await terminate.mutateAsync({
      id: employeeId,
      terminationDate: format(date, "yyyy-MM-dd"),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ukončit pracovní poměr</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Zaměstnanec <span className="font-medium text-foreground">{employeeName}</span> bude
            označen jako neaktivní k vybranému datu. Karta zůstane viditelná pro zachování
            historie absencí a logů.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Datum ukončení</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "d. M. yyyy", { locale: cs }) : "Vyberte datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button onClick={handleConfirm} disabled={!date || terminate.isPending}>
            Ukončit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
