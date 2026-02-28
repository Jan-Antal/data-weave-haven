import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value, oldValue, projectId }: { id: string; field: string; value: string; oldValue: string; projectId?: string }) => {
      let parsed: string | number | null = value;
      // Handle numeric fields
      const numericFields = ["prodejni_cena", "material", "subdodavky", "vyroba", "tpv_cost", "percent_tpv"];
      if (numericFields.includes(field)) {
        parsed = value === "" ? null : Number(value);
      }
      const { error } = await supabase.from("projects").update({ [field]: parsed } as any).eq("id", id);
      if (error) throw error;

      // Log status and konstrukter changes
      if (field === "status" && value !== oldValue && projectId) {
        logActivity({ projectId, actionType: "status_change", oldValue: oldValue || "—", newValue: value || "—" });
      }
      if (field === "konstrukter" && value !== oldValue && projectId) {
        logActivity({ projectId, actionType: "konstrukter_change", oldValue: oldValue || "—", newValue: value || "—" });
      }
      if (field === "datum_smluvni" && value !== oldValue && projectId) {
        const fmtOld = oldValue ? (parseAppDate(oldValue) ? formatAppDate(parseAppDate(oldValue)!) : oldValue) : "—";
        const fmtNew = value ? (parseAppDate(value) ? formatAppDate(parseAppDate(value)!) : value) : "—";
        logActivity({ projectId, actionType: "datum_smluvni_change", oldValue: fmtOld, newValue: fmtNew });
      }

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
