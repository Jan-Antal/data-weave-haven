import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, MoreVertical, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { toast } from "@/hooks/use-toast";

const UVAZEK_OPTIONS = [4, 6, 8];

/** Stredisko canonical kind from raw label. */
type StrediskoKind = "direct" | "indirect" | "provoz" | "none";
function strediskoKind(stredisko: string | null | undefined): StrediskoKind {
  const s = (stredisko ?? "").toLowerCase();
  if (s.includes("direct")) return "direct";
  if (s.includes("indirect")) return "indirect";
  if (s.includes("provoz")) return "provoz";
  return "none";
}

/** Block-level theming per stredisko. */
const BLOCK_THEME: Record<StrediskoKind, {
  headerBg: string;
  headerBorder: string;
  badgeBg: string;
  badgeFg: string;
  subBg: string;
  description: string;
}> = {
  direct: {
    headerBg: "#EAF3DE",
    headerBorder: "#97C459",
    badgeBg: "#D7E9BC",
    badgeFg: "#3F6212",
    subBg: "#F5F9EE",
    description: "Kapacita výroby · priame náklady",
  },
  indirect: {
    headerBg: "#FAEEDA",
    headerBorder: "#EF9F27",
    badgeBg: "#F4DEB1",
    badgeFg: "#7C4A03",
    subBg: "#FCF6EA",
    description: "Podporné výrobné činnosti · nepriame náklady",
  },
  provoz: {
    headerBg: "#EEEDFE",
    headerBorder: "#AFA9EC",
    badgeBg: "#DDDAFB",
    badgeFg: "#3F367C",
    subBg: "#F6F5FE",
    description: "Réžia a projektové role",
  },
  none: {
    headerBg: "hsl(var(--muted))",
    headerBorder: "hsl(var(--border))",
    badgeBg: "hsl(var(--muted))",
    badgeFg: "hsl(var(--muted-foreground))",
    subBg: "hsl(var(--muted) / 0.4)",
    description: "Bez priradenia",
  },
};

/** Map a Provoz úsek name to its dropdown role tag. */
function provozRoleTag(usek: string): { label: string; color: string } | null {
  const u = usek.toLowerCase();
  if (u.includes("projekt") || u.includes("pm")) return { label: "→ PM", color: "#3F367C" };
  if (u.includes("konštruk") || u.includes("konstruk")) return { label: "→ Konštruktér", color: "#3F367C" };
  if (u.includes("kalkul")) return { label: "→ Kalkulant", color: "#3F367C" };
  return null;
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
        .select("id, meno, usek, usek_nazov, stredisko, pozicia, uvazok_hodiny, activated_at, deactivated_at, deactivated_date, aktivny, is_pm, is_kalkulant, is_konstrukter")
        .order("meno", { ascending: true });
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
    if (value === "__none") {
      updateEmp.mutate({ id: emp.id, patch: { pozicia: null } });
      return;
    }
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

  /** Toggle a project role flag on an employee + sync into people cache. */
  const handleRoleToggle = async (
    emp: any,
    flag: "is_pm" | "is_kalkulant" | "is_konstrukter",
    next: boolean,
  ) => {
    // 1. Update ami_employees
    const { error: empErr } = await supabase
      .from("ami_employees")
      .update({ [flag]: next } as any)
      .eq("id", emp.id);
    if (empErr) {
      toast({ title: "Chyba", description: empErr.message, variant: "destructive" });
      return;
    }

    // 2. Compute new flag triple
    const flags = {
      is_pm: flag === "is_pm" ? next : !!emp.is_pm,
      is_kalkulant: flag === "is_kalkulant" ? next : !!emp.is_kalkulant,
      is_konstrukter: flag === "is_konstrukter" ? next : !!emp.is_konstrukter,
    };
    const anyOn = flags.is_pm || flags.is_kalkulant || flags.is_konstrukter;

    // 3. Upsert people cache (key: employee_id)
    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .eq("employee_id", emp.id)
      .maybeSingle();

    const primaryRole = flags.is_pm ? "PM" : flags.is_konstrukter ? "Konstruktér" : flags.is_kalkulant ? "Kalkulant" : "PM";

    if (existing) {
      await supabase
        .from("people")
        .update({
          name: emp.meno,
          ...flags,
          is_active: anyOn,
          source: "employee",
          role: primaryRole,
        } as any)
        .eq("id", (existing as any).id);
    } else if (anyOn) {
      await supabase.from("people").insert({
        name: emp.meno,
        role: primaryRole,
        source: "employee",
        employee_id: emp.id,
        is_active: true,
        is_external: false,
        ...flags,
      } as any);
    }

    qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
    qc.invalidateQueries({ queryKey: ["people"] });
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

      {/* Blocks per stredisko */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {(() => {
          // Order: Direct, Indirect, Provoz, Nepriradené, then any others
          const orderRank = (s: string) => {
            const k = strediskoKind(s);
            if (k === "direct") return 0;
            if (k === "indirect") return 1;
            if (k === "provoz") return 2;
            if (s === "Nepriradené") return 3;
            return 4;
          };
          const blocks = Array.from(grouped.entries()).sort((a, b) => {
            const ra = orderRank(a[0]); const rb = orderRank(b[0]);
            if (ra !== rb) return ra - rb;
            return a[0].localeCompare(b[0], "cs");
          });

          if (filtered.length === 0) {
            return (
              <div className="text-center text-sm text-muted-foreground py-8">
                Žádní zaměstnanci nenalezeni.
              </div>
            );
          }

          return blocks.map(([stredisko, useks]) => {
            const kind = strediskoKind(stredisko);
            const theme = BLOCK_THEME[kind];
            // Block totals
            let blockHeads = 0;
            let blockHrs = 0;
            for (const emps of useks.values()) {
              blockHeads += emps.length;
              for (const e of emps) blockHrs += (e.uvazok_hodiny ?? 8) * 5;
            }

            return (
              <div
                key={stredisko}
                className="rounded-lg overflow-hidden mb-3"
                style={{ border: "0.5px solid hsl(var(--border))" }}
              >
                {/* Block header */}
                <div
                  className="px-4 py-2.5 flex items-center gap-3"
                  style={{
                    backgroundColor: theme.headerBg,
                    borderBottom: `0.5px solid ${theme.headerBorder}`,
                  }}
                >
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
                    style={{ backgroundColor: theme.badgeBg, color: theme.badgeFg }}
                  >
                    {stredisko}
                  </span>
                  <span className="text-[11px]" style={{ color: theme.badgeFg, opacity: 0.85 }}>
                    {theme.description}
                  </span>
                  <span
                    className="ml-auto text-[11px] font-medium tabular-nums"
                    style={{ color: theme.badgeFg }}
                  >
                    {blockHeads} {blockHeads === 1 ? "osoba" : blockHeads < 5 ? "osoby" : "osob"} · {blockHrs} h/týd
                  </span>
                </div>

                {/* Sub-tables per úsek */}
                {Array.from(useks.entries()).map(([usek, emps]) => {
                  const subTotalHrs = emps.reduce(
                    (s: number, e: any) => s + (e.uvazok_hodiny ?? 8) * 5,
                    0,
                  );
                  const provozTag = kind === "provoz" ? provozRoleTag(usek) : null;
                  return (
                    <div key={`${stredisko}-${usek}`}>
                      {/* Úsek sub-header */}
                      <div
                        className="px-4 py-1.5 flex items-center gap-2 border-b border-border/50"
                        style={{ backgroundColor: theme.subBg }}
                      >
                        <span className="text-[11px] font-medium text-foreground">{usek}</span>
                        {provozTag && (
                          <span
                            className="text-[11px] font-medium"
                            style={{ color: provozTag.color }}
                          >
                            {provozTag.label}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                          {emps.length} · {subTotalHrs} h/týd
                        </span>
                      </div>

                      <Table>
                        <TableHeader className="sr-only">
                          <TableRow>
                            <TableHead className="w-[260px]">Jméno</TableHead>
                            <TableHead className="w-[180px]">Úsek</TableHead>
                            <TableHead className="w-[160px]">Pozice</TableHead>
                            <TableHead className="w-[200px]">Role na projektu</TableHead>
                            <TableHead className="w-[110px]">Úvazek</TableHead>
                            <TableHead className="w-[160px]">Absence</TableHead>
                            <TableHead className="w-[150px]">Stav</TableHead>
                            <TableHead className="w-[40px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {emps.map((emp: any) => {
                            const active = activePeriodForEmployee(periods, emp.id);
                            const terminationDate = emp.deactivated_date || (emp.deactivated_at ? (emp.deactivated_at as string).slice(0, 10) : null);
                            const isTerminated = !emp.aktivny || (terminationDate && terminationDate <= format(new Date(), "yyyy-MM-dd"));
                            const positionsForUsek = positionsByUsek.get(emp.usek_nazov ?? "") ?? [];
                            const av = avatarStyles(emp.meno ?? "");
                            return (
                              <TableRow key={emp.id} data-emp-row={emp.id} className={cn("transition-shadow group/row", isTerminated ? "opacity-50" : "")}>
                                <TableCell className="w-[260px]">
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
                                <TableCell className="w-[180px]">
                                  <Select
                                    value={emp.usek_nazov ?? "__none"}
                                    onValueChange={(v) => handleUsekChange(emp, v)}
                                  >
                                    <SelectTrigger className={INLINE_SELECT_TRIGGER}>
                                      <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none" disabled>—</SelectItem>
                                      {usekOptions.map((u) => (
                                        <SelectItem key={`${u.stredisko}-${u.usek}`} value={u.usek}>{u.usek}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="w-[160px]">
                                  <Select
                                    value={emp.pozicia ?? "__none"}
                                    onValueChange={(v) => handlePoziciaChange(emp, v)}
                                    disabled={!emp.usek_nazov}
                                  >
                                    <SelectTrigger
                                      className={INLINE_SELECT_TRIGGER}
                                      title={!emp.usek_nazov ? "Nejprve vyberte úsek" : undefined}
                                    >
                                      <SelectValue placeholder={!emp.usek_nazov ? "Vyberte úsek…" : "—"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none">— Neobsazeno</SelectItem>
                                      {positionsForUsek.map((p) => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="w-[200px]">
                                  {(() => {
                                    const roles: Array<["is_pm" | "is_kalkulant" | "is_konstrukter", string]> = [
                                      ["is_pm", "PM"],
                                      ["is_kalkulant", "Kalkulant"],
                                      ["is_konstrukter", "Konstruktér"],
                                    ];
                                    const selected = roles.filter(([f]) => !!emp[f]).map(([, l]) => l);
                                    const summary = selected.length ? selected.join(", ") : "—";
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-8 text-xs justify-start font-normal w-full">
                                            {summary}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-2" align="start">
                                          <div className="space-y-1.5">
                                            {roles.map(([flag, label]) => (
                                              <label key={flag} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                                                <Checkbox
                                                  checked={!!emp[flag]}
                                                  onCheckedChange={(v) => handleRoleToggle(emp, flag, v === true)}
                                                  className="h-4 w-4"
                                                />
                                                <span className="text-xs">{label}</span>
                                              </label>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="w-[110px]">
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
                                <TableCell className="w-[160px]">
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
                                <TableCell className="w-[150px]">
                                  {isTerminated && terminationDate ? (
                                    <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200">
                                      Ukončen k {format(new Date(terminationDate), "d. M. yyyy", { locale: cs })}
                                    </Badge>
                                  ) : active && (active.absencia_kod === "NEM" || active.absencia_kod === "PN" || active.absencia_kod === "RD") ? (
                                    (() => {
                                      const days = Math.round((new Date(active.date_to).getTime() - new Date(active.date_from).getTime()) / 86400000);
                                      const isOpenEnded = days >= 170;
                                      return (
                                        <Badge variant="outline" className="text-[10px] leading-tight bg-amber-50 text-amber-800 border-amber-200 flex flex-col items-start py-0.5 px-1.5 max-w-[140px]">
                                          <span className="font-medium">Pozastaveno</span>
                                          <span className="text-[9px] opacity-80 truncate w-full">
                                            {isOpenEnded ? "předp. návrat" : "návrat"} {format(new Date(active.date_to), "d. M. yyyy", { locale: cs })}
                                          </span>
                                        </Badge>
                                      );
                                    })()
                                  ) : (
                                    <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200">
                                      Aktívny
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="w-[40px]">
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
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}
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
