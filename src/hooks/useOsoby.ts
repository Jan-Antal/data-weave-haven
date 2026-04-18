import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// =====================================================================
// Position catalogue (Stredisko → Úsek → Pozice)
// =====================================================================

export type ProjectDropdownRole = "pm" | "kalkulant" | "konstrukter" | null;

export interface CataloguePosition {
  id: string;
  stredisko: string;
  usek: string;
  pozicia: string;
  project_dropdown_role: ProjectDropdownRole;
  is_active: boolean;
  sort_order: number;
}

export function usePositionCatalogue() {
  return useQuery({
    queryKey: ["position_catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("position_catalogue" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CataloguePosition[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CataloguePosition> & { stredisko: string; usek: string; pozicia: string }) => {
      if (row.id) {
        const { data, error } = await supabase
          .from("position_catalogue" as any)
          .update(row as any)
          .eq("id", row.id)
          .select()
          .single();
        if (error) throw error;
        return { mode: "update" as const, row: data as unknown as CataloguePosition };
      } else {
        const { data, error } = await supabase
          .from("position_catalogue" as any)
          .insert(row as any)
          .select()
          .single();
        if (error) throw error;
        return { mode: "insert" as const, row: data as unknown as CataloguePosition };
      }
    },
    onSuccess: async (result) => {
      // Patch cache instantly so the new/updated row appears without waiting for refetch.
      qc.setQueryData<CataloguePosition[]>(["position_catalogue"], (old) => {
        const list = old ?? [];
        if (result.mode === "insert") return [...list, result.row];
        return list.map((r) => (r.id === result.row.id ? result.row : r));
      });
      await qc.invalidateQueries({ queryKey: ["position_catalogue"], refetchType: "active" });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });
}

export function useRenamePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; stredisko: string; usek: string; oldName: string; newName: string }) => {
      const { id, stredisko, usek, oldName, newName } = args;
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Název pozice nesmí být prázdný");
      if (trimmed === oldName) return { updatedEmployees: 0 };

      // 1) Update catalogue row
      const { error: e1 } = await supabase
        .from("position_catalogue" as any)
        .update({ pozicia: trimmed } as any)
        .eq("id", id);
      if (e1) throw e1;

      // 2) Cascade rename to employees with the SAME stredisko+usek+old pozicia
      const { data: emps, error: e2 } = await supabase
        .from("ami_employees")
        .update({ pozicia: trimmed } as any)
        .eq("stredisko", stredisko)
        .eq("usek_nazov", usek)
        .eq("pozicia", oldName)
        .select("id");
      if (e2) throw e2;

      return { updatedEmployees: emps?.length ?? 0 };
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["position_catalogue"], refetchType: "active" });
      await qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["employees-for-week"] });
      qc.invalidateQueries({ queryKey: ["unified-members"] });
      toast({
        title: "Pozice přejmenována",
        description: res.updatedEmployees > 0 ? `Aktualizováno ${res.updatedEmployees} zaměstnanců` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("position_catalogue" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["position_catalogue"], refetchType: "active" });
    },
  });
}

// =====================================================================
// Members for project dropdowns: UNION of internal employees + externals
// =====================================================================

export interface UnifiedMember {
  id: string;          // synthetic — prefixed with source
  source: "employee" | "external";
  name: string;
  role: string;        // "PM" | "Konstruktér" | "Kalkulant" | "Architekt" | …
  firma?: string | null;
}

const ROLE_FROM_DROPDOWN: Record<string, string> = {
  pm: "PM",
  konstrukter: "Konstruktér",
  kalkulant: "Kalkulant",
};

export function useActiveMembersForRole(role: string | null) {
  return useQuery({
    queryKey: ["unified-members", role],
    queryFn: async () => {
      const out: UnifiedMember[] = [];

      // External / legacy people rows (existing project_dropdown source)
      let pq = supabase.from("people").select("id, name, role, firma, is_external, is_active").eq("is_active", true);
      if (role) pq = pq.eq("role", role);
      const { data: peopleRows, error: pe } = await pq.order("name");
      if (pe) throw pe;
      for (const p of (peopleRows ?? []) as any[]) {
        out.push({
          id: `ext:${p.id}`,
          source: "external",
          name: p.name,
          role: p.role,
          firma: p.firma ?? null,
        });
      }

      // Internal employees joined with catalogue
      const matchingDropdown = role
        ? Object.entries(ROLE_FROM_DROPDOWN).find(([_, label]) => label === role)?.[0]
        : null;
      if (!role || matchingDropdown) {
        const { data: cat } = await supabase
          .from("position_catalogue" as any)
          .select("usek, project_dropdown_role")
          .eq("is_active", true);
        const useksForRole = new Set<string>();
        for (const c of (((cat ?? []) as unknown) as Array<{ usek: string; project_dropdown_role: string | null }>)) {
          if (!matchingDropdown && c.project_dropdown_role) useksForRole.add(c.usek);
          else if (matchingDropdown && c.project_dropdown_role === matchingDropdown) useksForRole.add(c.usek);
        }
        if (useksForRole.size > 0) {
          const { data: emps } = await supabase
            .from("ami_employees")
            .select("id, meno, usek_nazov, aktivny")
            .eq("aktivny", true)
            .in("usek_nazov", Array.from(useksForRole));
          for (const e of (emps ?? []) as any[]) {
            // Avoid duplicates if same name already exists in `people`
            const dup = out.find(m => m.name.toLowerCase() === (e.meno ?? "").toLowerCase() && (!role || m.role === role));
            if (dup) continue;
            const inferredRole = matchingDropdown
              ? ROLE_FROM_DROPDOWN[matchingDropdown]
              : ROLE_FROM_DROPDOWN[(((cat ?? []) as any).find((c: any) => c.usek === e.usek_nazov)?.project_dropdown_role) ?? "pm"];
            out.push({
              id: `emp:${e.id}`,
              source: "employee",
              name: e.meno,
              role: inferredRole,
            });
          }
        }
      }

      return out.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    },
    staleTime: 60 * 1000,
  });
}

// =====================================================================
// Employees active in a given week (for Kapacita → Zaměstnanci sub-tab)
// =====================================================================

export interface EmployeeWeekRow {
  id: string;
  meno: string;
  usek: string;
  usek_nazov: string | null;
  stredisko: string | null;
  pozicia: string | null;
  uvazok_hodiny: number | null;
  is_included_in_week: boolean;
}

export function useEmployeesForWeek(weekStart: string, weekYear: number, weekNumber: number) {
  return useQuery({
    queryKey: ["employees-for-week", weekStart, weekYear, weekNumber],
    queryFn: async () => {
      const weekStartDate = weekStart;
      const weekEndDate = (() => {
        const d = new Date(weekStart + "T00:00:00");
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
      })();

      const [{ data: emps, error: e1 }, { data: comp, error: e2 }] = await Promise.all([
        supabase.from("ami_employees").select("id, meno, usek, usek_nazov, stredisko, pozicia, uvazok_hodiny, activated_at, deactivated_at, deactivated_date, aktivny"),
        supabase.from("production_capacity_employees" as any).select("employee_id, is_included").eq("week_year", weekYear).eq("week_number", weekNumber),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const compMap = new Map<string, boolean>();
      for (const c of (((comp ?? []) as unknown) as Array<{ employee_id: string; is_included: boolean }>)) {
        compMap.set(c.employee_id, c.is_included);
      }

      const result: EmployeeWeekRow[] = [];
      for (const e of (emps ?? []) as any[]) {
        const activatedOk = !e.activated_at || (e.activated_at as string).slice(0, 10) <= weekEndDate;
        const deactDate = e.deactivated_date || (e.deactivated_at ? (e.deactivated_at as string).slice(0, 10) : null);
        const deactivatedOk = !deactDate || deactDate >= weekStartDate;
        if (!activatedOk || !deactivatedOk) continue;
        result.push({
          id: e.id,
          meno: e.meno,
          usek: e.usek,
          usek_nazov: e.usek_nazov,
          stredisko: e.stredisko,
          pozicia: e.pozicia,
          uvazok_hodiny: e.uvazok_hodiny,
          is_included_in_week: compMap.has(e.id) ? compMap.get(e.id)! : true,
        });
      }
      return result.sort((a, b) => a.meno.localeCompare(b.meno, "cs"));
    },
    staleTime: 30 * 1000,
  });
}

// =====================================================================
// Employee mutations
// =====================================================================

export function useUpdateEmployeeFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("ami_employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      // Optimistic local update — instant UI feedback (no refresh needed)
      await qc.cancelQueries({ queryKey: ["all-employees-osoby"] });
      const prev = qc.getQueryData<any[]>(["all-employees-osoby"]);
      qc.setQueryData<any[]>(["all-employees-osoby"], (old) =>
        old?.map((e) => (e.id === id ? { ...e, ...patch } : e)) ?? old,
      );
      qc.setQueriesData<any[]>({ queryKey: ["vyrobni-employees"] }, (old) =>
        old?.map((e) => (e.id === id ? { ...e, ...patch } : e)) ?? old,
      );
      return { prev };
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["all-employees-osoby"], ctx.prev);
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["employees-for-week"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
      qc.invalidateQueries({ queryKey: ["unified-members"] });
    },
  });
}

export function useTerminateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, terminationDate }: { id: string; terminationDate: string }) => {
      const { error } = await supabase
        .from("ami_employees")
        .update({ deactivated_date: terminationDate, aktivny: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["employees-for-week"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
      toast({ title: "Pracovní poměr ukončen" });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });
}

export function useReactivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ami_employees")
        .update({ deactivated_date: null, deactivated_at: null, aktivny: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["employees-for-week"] });
      toast({ title: "Zaměstnanec obnoven" });
    },
  });
}

export function useDeleteEmployeePermanently() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Wipe related absences first
      await supabase.from("ami_absences").delete().eq("employee_id", id);
      const { error } = await supabase.from("ami_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-employees-osoby"] });
      qc.invalidateQueries({ queryKey: ["vyrobni-employees"] });
      qc.invalidateQueries({ queryKey: ["employees-for-week"] });
      qc.invalidateQueries({ queryKey: ["manual-absences"] });
      toast({ title: "Zaměstnanec smazán" });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });
}
