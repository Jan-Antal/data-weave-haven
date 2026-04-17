import { useMemo, useState } from "react";
import { Search, Plus, Trash2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVyrobniEmployees, type EmployeeRow } from "@/hooks/useCapacityCalc";
import { useManualAbsences, useUpdateEmployee, useDeleteAbsencePeriod, activePeriodForEmployee, type AbsencePeriod } from "@/hooks/useEmployeeAbsences";
import { EmployeeAbsenceDialog } from "./EmployeeAbsenceDialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const UVAZEK_OPTIONS = [
  { label: "20 h/týd", daily: 4 },
  { label: "30 h/týd", daily: 6 },
  { label: "40 h/týd", daily: 8 },
];

export function EmployeeManagement() {
  const { data: employees = [] } = useVyrobniEmployees();
  const { data: periods = [] } = useManualAbsences();
  const updateEmp = useUpdateEmployee();
  const deletePeriod = useDeleteAbsencePeriod();

  const [search, setSearch] = useState("");
  const [absenceFor, setAbsenceFor] = useState<EmployeeRow | null>(null);

  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const g = (e as any).pracovni_skupina as string | null | undefined;
      if (g && g.trim()) set.add(g.trim());
    }
    return Array.from(set).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      (e.meno ?? "").toLowerCase().includes(q) ||
      (e.usek ?? "").toLowerCase().includes(q) ||
      ((e as any).pracovni_skupina ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  const handleUvazek = async (emp: EmployeeRow, daily: number) => {
    try {
      await updateEmp.mutateAsync({ id: emp.id, patch: { uvazok_hodiny: daily } });
      toast({ title: "Úvazek aktualizován", description: `${emp.meno} → ${daily * 5} h/týden` });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const handleSkupina = async (emp: EmployeeRow, value: string) => {
    const v = value.trim() || null;
    try {
      await updateEmp.mutateAsync({ id: emp.id, patch: { pracovni_skupina: v } });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const handleDeletePeriod = async (period: AbsencePeriod) => {
    if (!confirm(`Smazat absenci ${period.absencia_kod} (${period.date_from} → ${period.date_to})?`)) return;
    try {
      await deletePeriod.mutateAsync(period.ids);
      toast({ title: "Absence smazána" });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hledat zaměstnance, úsek nebo pracovní skupinu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length} / {employees.length}
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jméno</TableHead>
                <TableHead>Úsek</TableHead>
                <TableHead>Pracovní skupina</TableHead>
                <TableHead>Úvazek</TableHead>
                <TableHead>Absence (aktivní)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Žádní zaměstnanci.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(emp => {
                const skupina = (emp as any).pracovni_skupina as string | null | undefined;
                const dailyHours = emp.uvazok_hodiny ?? 8;
                const active = activePeriodForEmployee(periods, emp.id);
                const allForEmp = periods.filter(p => p.employee_id === emp.id);
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.meno}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{emp.usek}</Badge>
                    </TableCell>
                    <TableCell>
                      <SkupinaSelect
                        value={skupina ?? ""}
                        options={existingGroups}
                        onChange={(v) => handleSkupina(emp, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(dailyHours)}
                        onValueChange={(v) => handleUvazek(emp, Number(v))}
                      >
                        <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UVAZEK_OPTIONS.map(o => (
                            <SelectItem key={o.daily} value={String(o.daily)}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {active ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-300 cursor-help"
                            >
                              🟡 {active.absencia_kod} do {format(new Date(active.date_to + "T00:00:00"), "d. M. yy")}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <div className="text-xs">
                              <div className="font-medium mb-1">Aktuální absence</div>
                              <div>{active.absencia_kod}: {active.date_from} → {active.date_to}</div>
                              {allForEmp.length > 1 && (
                                <div className="mt-2 pt-2 border-t border-border">
                                  <div className="font-medium mb-1">Historie ({allForEmp.length})</div>
                                  {allForEmp.slice(0, 5).map((p, i) => (
                                    <div key={i}>{p.absencia_kod}: {p.date_from} → {p.date_to}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EmpActions
                        emp={emp}
                        periods={allForEmp}
                        onAddAbsence={() => setAbsenceFor(emp)}
                        onDeletePeriod={handleDeletePeriod}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {absenceFor && (
          <EmployeeAbsenceDialog
            open={!!absenceFor}
            onOpenChange={(v) => !v && setAbsenceFor(null)}
            employeeId={absenceFor.id}
            employeeName={absenceFor.meno ?? ""}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function SkupinaSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const all = Array.from(new Set([...options, value].filter(Boolean)));

  return (
    <div className="flex items-center gap-1">
      <Select
        value={value || "__none__"}
        onValueChange={(v) => {
          if (v === "__add__") { setOpen(true); return; }
          if (v === "__none__") { onChange(""); return; }
          onChange(v);
        }}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— žádná —</SelectItem>
          {all.map(g => (
            <SelectItem key={g} value={g}>{g}</SelectItem>
          ))}
          <SelectItem value="__add__">+ Nová skupina…</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><span /></PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <div className="text-xs font-medium">Nová pracovní skupina</div>
            <Input
              autoFocus
              placeholder="např. Lakovna, Kompletace"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) {
                  onChange(custom.trim());
                  setCustom("");
                  setOpen(false);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setCustom(""); setOpen(false); }}>Zrušit</Button>
              <Button size="sm" onClick={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); } }}>
                Přidat
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function EmpActions({ emp, periods, onAddAbsence, onDeletePeriod }: {
  emp: EmployeeRow;
  periods: AbsencePeriod[];
  onAddAbsence: () => void;
  onDeletePeriod: (p: AbsencePeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2">⋯</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start mb-2"
          onClick={() => { onAddAbsence(); setOpen(false); }}
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Přidat absenci
        </Button>
        {periods.length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Historie</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {periods.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span>
                    <Badge variant="outline" className="mr-1 text-[10px]">{p.absencia_kod}</Badge>
                    {p.date_from} → {p.date_to}
                  </span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDeletePeriod(p)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {periods.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-1">
            <AlertCircle className="h-3 w-3" /> Žádné záznamy
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
