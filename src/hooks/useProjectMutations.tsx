import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import type { Project } from "@/hooks/useProjects";

const NUMERIC_FIELDS = ["prodejni_cena", "material", "subdodavky", "vyroba", "tpv_cost", "percent_tpv"];

function parseField(field: string, value: string): string | number | null {
  if (NUMERIC_FIELDS.includes(field)) return value === "" ? null : Number(value);
  return value;
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value, oldValue, projectId }: { id: string; field: string; value: string; oldValue: string; projectId?: string }) => {
      const parsed = parseField(field, value);
      const { data, error } = await supabase
        .from("projects")
        .update({ [field]: parsed } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Log activity
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

      return { id, field, oldValue, updatedProject: data as Project };
    },
    onSuccess: ({ id, field, oldValue, updatedProject }) => {
      // Patch single project in cache instead of full refetch
      qc.setQueryData<Project[]>(["projects"], (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === id ? { ...p, ...updatedProject } : p));
      });

      toast({
        title: "Uloženo",
        description: "Klikněte pro vrácení změny",
        action: (
          <button
            className="text-xs underline px-2 py-1"
            onClick={async () => {
              const parsed = parseField(field, oldValue);
              const { data } = await supabase
                .from("projects")
                .update({ [field]: parsed } as any)
                .eq("id", id)
                .select()
                .single();
              if (data) {
                qc.setQueryData<Project[]>(["projects"], (old) => {
                  if (!old) return old;
                  return old.map((p) => (p.id === id ? { ...p, ...data } : p));
                });
              } else {
                qc.invalidateQueries({ queryKey: ["projects"] });
              }
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
