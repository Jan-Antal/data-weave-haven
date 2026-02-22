import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value, oldValue }: { id: string; field: string; value: string; oldValue: string }) => {
      let parsed: string | number | null = value;
      // Handle numeric fields
      const numericFields = ["prodejni_cena", "material", "subdodavky", "vyroba", "tpv_cost", "percent_tpv"];
      if (numericFields.includes(field)) {
        parsed = value === "" ? null : Number(value);
      }
      const { error } = await supabase.from("projects").update({ [field]: parsed } as any).eq("id", id);
      if (error) throw error;
      return { id, field, oldValue };
    },
    onSuccess: ({ id, field, oldValue }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: "Uloženo",
        description: "Klikněte pro vrácení změny",
        action: (
          <button
            className="text-xs underline px-2 py-1"
            onClick={async () => {
              let parsed: string | number | null = oldValue;
              const numericFields = ["prodejni_cena", "material", "subdodavky", "vyroba", "tpv_cost", "percent_tpv"];
              if (numericFields.includes(field)) parsed = oldValue === "" ? null : Number(oldValue);
              await supabase.from("projects").update({ [field]: parsed } as any).eq("id", id);
              qc.invalidateQueries({ queryKey: ["projects"] });
            }}
          >
            Undo
          </button>
        ) as any,
      });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit změnu", variant: "destructive" });
    },
  });
}
