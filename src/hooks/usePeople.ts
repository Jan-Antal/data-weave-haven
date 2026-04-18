import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Person {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function usePeople(role?: string) {
  return useQuery({
    queryKey: ["people", "unified", role],
    queryFn: async () => {
      // 1. Externals + legacy people rows
      let q = supabase.from("people").select("*").eq("is_active", true).order("name");
      if (role) q = q.eq("role", role);
      const { data: peopleRows, error } = await q;
      if (error) throw error;
      const out: Person[] = (peopleRows ?? []) as any;

      // 2. Active internal employees from catalogue (auto-merged)
      const ROLE_MAP: Record<string, string> = { PM: "pm", "Konstruktér": "konstrukter", Kalkulant: "kalkulant" };
      const dropdownKey = role ? ROLE_MAP[role] : null;
      if (!role || dropdownKey) {
        const { data: cat } = await supabase
          .from("position_catalogue" as any)
          .select("usek, project_dropdown_role")
          .eq("is_active", true);
        const useksByRole = new Map<string, string>(); // usek -> dropdown role
        for (const c of (((cat ?? []) as unknown) as Array<{ usek: string; project_dropdown_role: string | null }>)) {
          if (c.project_dropdown_role && (!dropdownKey || c.project_dropdown_role === dropdownKey)) {
            useksByRole.set(c.usek, c.project_dropdown_role);
          }
        }
        if (useksByRole.size > 0) {
          const { data: emps } = await supabase
            .from("ami_employees")
            .select("id, meno, usek_nazov")
            .eq("aktivny", true)
            .in("usek_nazov", Array.from(useksByRole.keys()));
          const inverseRoleMap: Record<string, string> = { pm: "PM", konstrukter: "Konstruktér", kalkulant: "Kalkulant" };
          for (const e of (emps ?? []) as any[]) {
            const dk = useksByRole.get(e.usek_nazov);
            if (!dk) continue;
            const empRole = inverseRoleMap[dk];
            // dedupe by name+role
            if (out.some(p => p.name.toLowerCase() === (e.meno ?? "").toLowerCase() && p.role === empRole)) continue;
            out.push({
              id: `emp:${e.id}`,
              name: e.meno,
              role: empRole,
              is_active: true,
              created_at: "",
            });
          }
        }
      }

      return out.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    },
  });
}

export function useAllPeople() {
  return useQuery({
    queryKey: ["people", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Person[];
    },
  });
}

/** Fetch ALL people including inactive (for PeopleManagement) */
export function useAllPeopleIncludingInactive() {
  return useQuery({
    queryKey: ["people", "all-including-inactive"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*").order("name");
      if (error) throw error;
      return data as Person[];
    },
  });
}

export function useAddPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, role }: { name: string; role: string }) => {
      const { data, error } = await supabase.from("people").insert({ name, role }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { role }) => {
      qc.invalidateQueries({ queryKey: ["people"] });
      toast({ title: "Osoba přidána" });
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}
