import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, MoreVertical, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { type EmployeeRow } from "@/hooks/useCapacityCalc";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useManualAbsences, activePeriodForEmployee } from "@/hooks/useEmployeeAbsences";
import { EmployeeAbsenceDialog } from "@/components/production/EmployeeAbsenceDialog";
import { usePositionCatalogue, useUpdateEmployeeFields, useReactivateEmployee, useDeleteEmployeePermanently } from "@/hooks/useOsoby";
import { UkoncitPracovniPomerDialog } from "./UkoncitPracovniPomerDialog";
import { cn } from "@/lib/utils";

const UVAZEK_OPTIONS = [4, 6, 8];

/** Stredisko pill colors — green/orange/purple per spec. */
function strediskoStyles(stredisko: string | null | undefined): string {
  const s = (stredisko ?? "").toLowerCase();
  if (s.includes("direct")) return "bg-green-100 text-green-800 border-green-200";
  if (s.includes("indirect")) return "bg-orange-100 text-orange-800 border-orange-200";
  if (s.includes("provoz")) return "bg-purple-100 text-purple-800 border-purple-200";
  return "bg-muted text-muted-foreground border-border";
}

/** Deterministic pastel avatar color from name hash. */
function avatarStyles(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { bg: `hsl(${hue}, 65%, 90%)`, fg: `hsl(${hue}, 45%, 30%)` };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const qc = useQueryClient();
  // Refetch catalogue + employees on mount so switching tabs from Číselníky shows latest names
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["position_catalogue"] });
    qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
  }, [qc]);

  const { data: employees = [] } = useAllEmployees();
  const { data: catalogue = [] } = usePositionCatalogue();
  const { data: periods = [] } = useManualAbsences();
  const updateEmp = useUpdateEmployeeFields();
  const deleteEmp = useDeleteEmployeePermanently();
  const reactivate = useReactivateEmployee();

  const [search, setSearch] = useState("");
  const [strediskoFilter, setStrediskoFilter] = useState<string>("all");
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

  

  const allStrediska = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) if (e.stredisko) set.add(e.stredisko);
    return Array.from(set).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (strediskoFilter !== "all" && (e.stredisko ?? "Nepriradené") !== strediskoFilter) return false;
      if (!q) return true;
      return (
        (e.meno ?? "").toLowerCase().includes(q) ||
        (e.usek ?? "").toLowerCase().includes(q) ||
        (e.usek_nazov ?? "").toLowerCase().includes(q) ||
        (e.pozicia ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, search, strediskoFilter]);

  // Group by stredisko → usek_nazov
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
    if (value === "__none") return;
    const cat = catalogue.find((c) => c.usek === value);
    const empId = emp.id;
    updateEmp.mutate(
      {
        id: empId,
        patch: {
          usek_nazov: value,
          stredisko: cat?.stredisko ?? emp.stredisko,
          pozicia: null,
        },
      },
      {
        onSuccess: () => {
          // Keep the row visible after re-grouping by úsek
          requestAnimationFrame(() => {
            const el = document.querySelector(`[data-emp-row="${empId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              (el as HTMLElement).classList.add("ring-2", "ring-primary/40");
              setTimeout(() => {
                (el as HTMLElement).classList.remove("ring-2", "ring-primary/40");
              }, 1500);
            }
          });
        },
      },
    );
  };

  const handlePoziciaChange = (emp: any, value: string) => {
    if (value === "__none") return;
    // Position must belong to emp's úsek (UI enforces úsek selected first)
    const cat = catalogue.find((c) => c.pozicia === value && c.usek === emp.usek_nazov);
    if (!cat) return;
    updateEmp.mutate({
      id: emp.id,
      patch: {
        pozicia: value,
        usek_nazov: cat.usek,
        stredisko: cat.stredisko,
      },
    });
  };

  const handleUvazek = (emp: any, daily: number) => {
    updateEmp.mutate({ id: emp.id, patch: { uvazok_hodiny: daily } });
  };

  const activeCount = employees.filter((e) => e.aktivny).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      {/* Section header — title meta + actions */}
      <div className="px-6 pt-4 pb-3 border-b bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Zaměstnanci · {activeCount} aktivních
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alveno sync · jen aktivní záznamy se importují automaticky
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={strediskoFilter} onValueChange={setStrediskoFilter}>
              <SelectTrigger className="h-9 w-[180px] text-sm">
                <SelectValue placeholder="Všechna střediska" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechna střediska</SelectItem>
                {allStrediska.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat zaměstnance…"
                className="pl-8 h-9 w-[240px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[260px]">Jméno</TableHead>
              <TableHead className="w-[180px]">Úsek</TableHead>
              <TableHead className="w-[160px]">Pozice</TableHead>
              <TableHead className="w-[110px]">Úvazek</TableHead>
              <TableHead className="w-[160px]">Absence</TableHead>
              <TableHead className="w-[150px]">Stav</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(grouped.entries()).map(([stredisko, useks]) =>
              Array.from(useks.entries()).map(([usek, emps]) => {
                const totalHrs = emps.reduce((s: number, e: any) => s + (e.uvazok_hodiny ?? 8) * 5, 0);
                return (
                  <>
                    <TableRow key={`${stredisko}-${usek}-hdr`} className="bg-muted/40 hover:bg-muted/40 border-b border-border/40">
                      <TableCell colSpan={7} className="py-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] font-medium border px-2 py-0.5", strediskoStyles(stredisko))}>
                            {stredisko}
                          </Badge>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground">{usek}</span>
                          <span className="text-[11px] text-muted-foreground">· {emps.length} osob · {totalHrs}h brutto/týd</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {emps.map((emp: any) => {
                      const active = activePeriodForEmployee(periods, emp.id);
                      const terminationDate = emp.deactivated_date || (emp.deactivated_at ? (emp.deactivated_at as string).slice(0, 10) : null);
                      const isTerminated = !emp.aktivny || (terminationDate && terminationDate <= format(new Date(), "yyyy-MM-dd"));
                      const positionsForUsek = positionsByUsek.get(emp.usek_nazov ?? "") ?? [];
                      const av = avatarStyles(emp.meno ?? "");
                      return (
                        <TableRow key={emp.id} data-emp-row={emp.id} className={cn("transition-shadow", isTerminated ? "opacity-50" : "")}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div
                                className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                                style={{ backgroundColor: av.bg, color: av.fg }}
                                aria-hidden
                              >
                                {getInitials(emp.meno ?? "")}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{emp.meno}</div>
                                <div className="text-[11px] text-muted-foreground">{emp.usek}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={emp.usek_nazov ?? "__none"}
                              onValueChange={(v) => handleUsekChange(emp, v)}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none" disabled>—</SelectItem>
                                {usekOptions.map((u) => (
                                  <SelectItem key={`${u.stredisko}-${u.usek}`} value={u.usek}>{u.usek}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={emp.pozicia ?? "__none"}
                              onValueChange={(v) => handlePoziciaChange(emp, v)}
                              disabled={!emp.usek_nazov}
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                title={!emp.usek_nazov ? "Nejprve vyberte úsek" : undefined}
                              >
                                <SelectValue placeholder={!emp.usek_nazov ? "Vyberte úsek…" : "—"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none" disabled>—</SelectItem>
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
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {UVAZEK_OPTIONS.map((d) => (
                                  <SelectItem key={d} value={String(d)}>{d * 5} h/týd</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {active ? (
                              <Badge variant="outline" className="text-[11px] bg-amber-100 text-amber-800 border-amber-200">
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
                              <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200">
                                Ukončen k {format(new Date(terminationDate), "d. M. yyyy", { locale: cs })}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200">
                                Aktívny
                              </Badge>
                            )}
                          </TableCell>
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
                    })}
                  </>
                );
              }),
            )}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Žádní zaměstnanci nenalezeni.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer hint */}
      <div className="px-6 py-2.5 border-t bg-muted/20 text-[11px] text-muted-foreground">
        Alveno absencia se importuje automaticky · manuálně lze přidat: RD / NEM / PN / Jiné
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
