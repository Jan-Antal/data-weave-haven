import { useMemo, useState } from "react";
import { Search, MoreVertical, Plus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useVyrobniEmployees, type EmployeeRow } from "@/hooks/useCapacityCalc";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useManualAbsences, activePeriodForEmployee } from "@/hooks/useEmployeeAbsences";
import { EmployeeAbsenceDialog } from "@/components/production/EmployeeAbsenceDialog";
import { usePositionCatalogue, useUpdateEmployeeFields, useReactivateEmployee, useDeleteEmployeePermanently } from "@/hooks/useOsoby";
import { UkoncitPracovniPomerDialog } from "./UkoncitPracovniPomerDialog";

const UVAZEK_OPTIONS = [4, 6, 8];

/** Fetch ALL employees including inactive — needed to show "Ukončen" rows */
function useAllEmployees() {
  return useQuery({
    queryKey: ["all-employees-osoby"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ami_employees")
        .select("id, meno, usek, usek_nazov, stredisko, pozicia, uvazok_hodiny, activated_at, deactivated_at, deactivated_date, aktivny");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30 * 1000,
  });
}

export function OsobyZamestnanci() {
  const { data: employees = [] } = useAllEmployees();
  const { data: catalogue = [] } = usePositionCatalogue();
  const { data: periods = [] } = useManualAbsences();
  const updateEmp = useUpdateEmployeeFields();
  const deleteEmp = useDeleteEmployeePermanently();
  const reactivate = useReactivateEmployee();

  const [search, setSearch] = useState("");
  const [absenceFor, setAbsenceFor] = useState<EmployeeRow | null>(null);
  const [terminateFor, setTerminateFor] = useState<{ id: string; name: string } | null>(null);
  const [deleteFor, setDeleteFor] = useState<{ id: string; name: string } | null>(null);

  const usekOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ stredisko: string; usek: string }> = [];
    for (const c of catalogue) {
      const key = `${c.stredisko}::${c.usek}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ stredisko: c.stredisko, usek: c.usek });
      }
    }
    return out;
  }, [catalogue]);

  const positionsByUsek = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of catalogue) {
      if (!map.has(c.usek)) map.set(c.usek, []);
      map.get(c.usek)!.push(c.pozicia);
    }
    return map;
  }, [catalogue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      (e.meno ?? "").toLowerCase().includes(q) ||
      (e.usek ?? "").toLowerCase().includes(q) ||
      (e.usek_nazov ?? "").toLowerCase().includes(q) ||
      (e.pozicia ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  // Group by stredisko → usek_nazov (fallback "Nepriradené")
  const grouped = useMemo(() => {
    const groups = new Map<string, Map<string, any[]>>();
    for (const e of filtered) {
      const s = e.stredisko ?? "Nepriradené";
      const u = e.usek_nazov ?? "—";
      if (!groups.has(s)) groups.set(s, new Map());
      const sub = groups.get(s)!;
      if (!sub.has(u)) sub.set(u, []);
      sub.get(u)!.push(e);
    }
    return groups;
  }, [filtered]);

  const handleUsekChange = (emp: any, value: string) => {
    const cat = catalogue.find(c => c.usek === value);
    updateEmp.mutate({
      id: emp.id,
      patch: {
        usek_nazov: value,
        stredisko: cat?.stredisko ?? emp.stredisko,
        pozicia: null, // reset pozice — user must pick from new úsek
      },
    });
  };

  const handlePoziciaChange = (emp: any, value: string) => {
    const cat = catalogue.find(c => c.pozicia === value && c.usek === emp.usek_nazov);
    updateEmp.mutate({
      id: emp.id,
      patch: {
        pozicia: value,
        usek_nazov: cat?.usek ?? emp.usek_nazov,
        stredisko: cat?.stredisko ?? emp.stredisko,
      },
    });
  };

  const handleUvazek = (emp: any, daily: number) => {
    updateEmp.mutate({ id: emp.id, patch: { uvazok_hodiny: daily } });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pb-3 flex items-center gap-2 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat zaměstnance, úsek nebo pozici…"
            className="pl-8 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} z {employees.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[200px]">Jméno</TableHead>
              <TableHead className="w-[180px]">Úsek</TableHead>
              <TableHead className="w-[160px]">Pozice</TableHead>
              <TableHead className="w-[110px]">Úvazek</TableHead>
              <TableHead className="w-[140px]">Absence</TableHead>
              <TableHead className="w-[140px]">Stav</TableHead>
              <TableHead className="w-[120px]">Alveno úsek</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(grouped.entries()).map(([stredisko, useks]) => (
              <>
                <TableRow key={`${stredisko}-hdr`} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={8} className="font-semibold text-sm py-1.5">
                    {stredisko}
                  </TableCell>
                </TableRow>
                {Array.from(useks.entries()).map(([usek, emps]) =>
                  emps.map((emp: any) => {
                    const active = activePeriodForEmployee(periods, emp.id);
                    const terminationDate = emp.deactivated_date || (emp.deactivated_at ? (emp.deactivated_at as string).slice(0, 10) : null);
                    const isTerminated = !emp.aktivny || (terminationDate && terminationDate <= format(new Date(), "yyyy-MM-dd"));
                    const positionsForUsek = positionsByUsek.get(emp.usek_nazov ?? "") ?? [];
                    return (
                      <TableRow key={emp.id} className={isTerminated ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{emp.meno}</TableCell>
                        <TableCell>
                          <Select
                            value={emp.usek_nazov ?? ""}
                            onValueChange={(v) => handleUsekChange(emp, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {usekOptions.map((u) => (
                                <SelectItem key={`${u.stredisko}-${u.usek}`} value={u.usek}>
                                  {u.usek}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={emp.pozicia ?? ""}
                            onValueChange={(v) => handlePoziciaChange(emp, v)}
                            disabled={!emp.usek_nazov}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={emp.usek_nazov ? "—" : "Vyberte úsek"} />
                            </SelectTrigger>
                            <SelectContent>
                              {positionsForUsek.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={String(emp.uvazok_hodiny ?? 8)}
                            onValueChange={(v) => handleUvazek(emp, Number(v))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UVAZEK_OPTIONS.map((d) => (
                                <SelectItem key={d} value={String(d)}>{d * 5} h/týd</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {active ? (
                            <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-900">
                              {active.absencia_kod}
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setAbsenceFor({ id: emp.id, meno: emp.meno, usek: emp.usek, uvazok_hodiny: emp.uvazok_hodiny })}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Přidat
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {isTerminated && terminationDate ? (
                            <Badge variant="outline" className="text-xs bg-muted">
                              Ukončen k {format(new Date(terminationDate), "d. M. yyyy", { locale: cs })}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-emerald-50 border-emerald-300 text-emerald-900">
                              Aktivní
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{emp.usek}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isTerminated ? (
                                <DropdownMenuItem onClick={() => setTerminateFor({ id: emp.id, name: emp.meno })}>
                                  Ukončit pracovní poměr
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => reactivate.mutate(emp.id)}>
                                  Obnovit zaměstnance
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setAbsenceFor({ id: emp.id, meno: emp.meno, usek: emp.usek, uvazok_hodiny: emp.uvazok_hodiny })}>
                                Spravovat absence
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteFor({ id: emp.id, name: emp.meno })}
                                className="text-destructive focus:text-destructive"
                              >
                                Smazat trvale
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  Žádní zaměstnanci nenalezeni.
                </TableCell>
              </TableRow>
            )}
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

      {terminateFor && (
        <UkoncitPracovniPomerDialog
          open={!!terminateFor}
          onOpenChange={(v) => !v && setTerminateFor(null)}
          employeeId={terminateFor.id}
          employeeName={terminateFor.name}
        />
      )}

      <ConfirmDialog
        open={!!deleteFor}
        onConfirm={() => {
          if (deleteFor) deleteEmp.mutate(deleteFor.id);
          setDeleteFor(null);
        }}
        onCancel={() => setDeleteFor(null)}
        title="Smazat zaměstnance trvale?"
        description={
          deleteFor
            ? `Trvale smaže ${deleteFor.name} včetně všech historických absencí. Tuto akci nelze vrátit.`
            : ""
        }
      />
    </div>
  );
}
