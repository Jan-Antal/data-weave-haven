import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ExchangeRate {
  id: string;
  year: number;
  eur_czk: number;
  created_at: string;
  updated_at: string;
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ["exchange_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .order("year", { ascending: true });
      if (error) throw error;
      return data as ExchangeRate[];
    },
  });
}

export function useUpdateExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eur_czk }: { id: string; eur_czk: number }) => {
      const { error } = await supabase
        .from("exchange_rates")
        .update({ eur_czk } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange_rates"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit kurz", variant: "destructive" });
    },
  });
}

export function useAddExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, eur_czk }: { year: number; eur_czk: number }) => {
      const { error } = await supabase
        .from("exchange_rates")
        .insert({ year, eur_czk } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange_rates"] });
      toast({ title: "Rok přidán" });
    },
    onError: (err: any) => {
      toast({ title: "Chyba", description: err.message || "Nepodařilo se přidat rok", variant: "destructive" });
    },
  });
}

export function useDeleteExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("exchange_rates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange_rates"] });
      toast({ title: "Rok odstraněn" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se smazat rok", variant: "destructive" });
    },
  });
}

/**
 * Get exchange rate for a given year. Falls back to the most recent available rate.
 */
export function getExchangeRate(rates: ExchangeRate[], year: number): number {
  const exact = rates.find((r) => r.year === year);
  if (exact) return exact.eur_czk;
  // Fallback to closest year
  const sorted = [...rates].sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
  return sorted.length > 0 ? sorted[0].eur_czk : 25.0;
}
