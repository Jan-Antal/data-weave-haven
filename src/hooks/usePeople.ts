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

const ROLE_BOOL_COLUMN: Record<string, "is_pm" | "is_kalkulant" | "is_konstrukter"> = {
  PM: "is_pm",
  Kalkulant: "is_kalkulant",
  "Konstruktér": "is_konstrukter",
};

export function usePeople(role?: string) {
  return useQuery({
    queryKey: ["people", "unified-v2", role],
    queryFn: async () => {
      let q = supabase.from("people").select("*").eq("is_active", true).order("name");
      const boolCol = role ? ROLE_BOOL_COLUMN[role] : null;
      if (boolCol) {
        q = q.eq(boolCol, true);
      } else if (role) {
        // Fallback for roles without bool column (e.g. Architekt) — keep string match
        q = q.eq("role", role);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any as Person[]).sort((a, b) =>
        a.name.localeCompare(b.name, "cs"),
      );
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
