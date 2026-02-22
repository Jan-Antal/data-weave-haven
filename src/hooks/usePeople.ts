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
    queryKey: ["people", role],
    queryFn: async () => {
      let q = supabase.from("people").select("*").eq("is_active", true).order("name");
      if (role) q = q.eq("role", role);
      const { data, error } = await q;
      if (error) throw error;
      return data as Person[];
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
