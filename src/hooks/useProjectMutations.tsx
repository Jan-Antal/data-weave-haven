import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import type { Project } from "@/hooks/useProjects";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useAuth } from "@/hooks/useAuth";
import { createNotification, getUserIdsByRole, resolvePersonToUserId } from "@/lib/createNotification";

const NUMERIC_FIELDS = ["prodejni_cena", "material", "subdodavky", "vyroba", "tpv_cost", "percent_tpv"];

function parseField(field: string, value: string): string | number | null {
  if (NUMERIC_FIELDS.includes(field)) return value === "" ? null : Number(value);
  return value;
}

export function useUpdateProject() {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const { user, profile } = useAuth();

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
      if (field === "pm" && value !== oldValue && projectId) {
        logActivity({ projectId, actionType: "pm_change", oldValue: oldValue || "—", newValue: value || "—" });
      }
      if (field === "kalkulant" && value !== oldValue && projectId) {
        logActivity({ projectId, actionType: "kalkulant_change", oldValue: oldValue || "—", newValue: value || "—" });
      }
      if (field === "prodejni_cena" && value !== oldValue && projectId) {
        logActivity({ projectId, actionType: "prodejni_cena_change", oldValue: oldValue || "—", newValue: value || "—" });
      }

      return { id, field, value, oldValue, updatedProject: data as Project };
    },
    onSuccess: ({ id, field, value, oldValue, updatedProject }) => {
      // Patch project in all cached query variants
      qc.getQueriesData<Project[]>({ queryKey: ["projects"] }).forEach(([key]) => {
        qc.setQueryData<Project[]>(key, (old) => {
          if (!old) return old;
          return old.map((p) => (p.id === id ? { ...p, ...updatedProject } : p));
        });
      });

      // Push to undo stack
      const parsedOld = parseField(field, oldValue);
      const parsedNew = parseField(field, value);
      pushUndo({
        page: "project-table",
        actionType: "inline_edit",
        description: `Úprava ${field}: "${oldValue || "—"}" → "${value || "—"}"`,
        undoPayload: {
          table: "projects",
          operation: "update",
          records: [{ id, [field]: parsedOld }],
          queryKeys: [["projects"]],
        },
        redoPayload: {
          table: "projects",
          operation: "update",
          records: [{ id, [field]: parsedNew }],
          queryKeys: [["projects"]],
        },
        undo: async () => {
          const { data } = await supabase
            .from("projects")
            .update({ [field]: parsedOld } as any)
            .eq("id", id)
            .select()
            .single();
          if (data) {
            qc.getQueriesData<Project[]>({ queryKey: ["projects"] }).forEach(([key]) => {
              qc.setQueryData<Project[]>(key, (old) => {
                if (!old) return old;
                return old.map((p) => (p.id === id ? { ...p, ...data } : p));
              });
            });
          } else {
            qc.invalidateQueries({ queryKey: ["projects"] });
          }
        },
        redo: async () => {
          const { data } = await supabase
            .from("projects")
            .update({ [field]: parsedNew } as any)
            .eq("id", id)
            .select()
            .single();
          if (data) {
            qc.getQueriesData<Project[]>({ queryKey: ["projects"] }).forEach(([key]) => {
              qc.setQueryData<Project[]>(key, (old) => {
                if (!old) return old;
                return old.map((p) => (p.id === id ? { ...p, ...data } : p));
              });
            });
          } else {
            qc.invalidateQueries({ queryKey: ["projects"] });
          }
        },
      });

      toast({ title: "Uloženo", duration: 2000 });

      // --- Notifications (fire-and-forget) ---
      if (!user || !profile) return;
      const actorName = profile.full_name || "";
      const projectName = updatedProject?.project_name || "";
      const pId = updatedProject?.project_id || "";

      (async () => {
        try {
          // PM assignment notifications
          if (field === "pm" && value !== oldValue) {
            // Notify NEW PM
            if (value) {
              const newPmUserId = await resolvePersonToUserId(supabase, value);
              if (newPmUserId && newPmUserId !== user.id) {
                await createNotification(supabase, {
                  userIds: [newPmUserId],
                  type: "pm_assigned",
                  title: `Bol si priradený ako PM na projekt ${pId} — ${projectName}`,
                  projectId: pId,
                  actorName,
                  excludeUserId: user.id,
                  linkContext: { tab: "project-info", project_id: pId },
                });
              }
            }
            // Notify OLD PM (removed)
            if (oldValue) {
              const oldPmUserId = await resolvePersonToUserId(supabase, oldValue);
              if (oldPmUserId && oldPmUserId !== user.id) {
                await createNotification(supabase, {
                  userIds: [oldPmUserId],
                  type: "pm_removed",
                  title: `Bol si odobraný z projektu ${pId} — ${projectName}`,
                  projectId: pId,
                  actorName,
                  excludeUserId: user.id,
                  linkContext: { tab: "project-info", project_id: pId },
                });
              }
            }
          }

          // Key field change notifications (status, price, deadline)
          const NOTIFY_FIELDS = ["status", "prodejni_cena", "datum_smluvni"];
          if (NOTIFY_FIELDS.includes(field) && value !== oldValue) {
            const adminIds = await getUserIdsByRole(supabase, ["owner", "admin"]);
            const pmName = updatedProject?.pm;
            let pmUserIds: string[] = [];
            if (pmName) {
              const pmUserId = await resolvePersonToUserId(supabase, pmName);
              if (pmUserId) pmUserIds = [pmUserId];
            }
            const allIds = [...adminIds, ...pmUserIds];
            await createNotification(supabase, {
              userIds: allIds,
              type: "project_changed",
              title: `Projekt upraven: ${projectName}`,
              body: `Změna pole ${field}: "${oldValue || "—"}" → "${value || "—"}"`,
              projectId: pId,
              actorName,
              excludeUserId: user.id,
              linkContext: { tab: "project-info", project_id: pId, field },
            });
          }
        } catch {
          // Silent fail
        }
      })();
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodařilo se uložit změnu", variant: "destructive" });
    },
  });
}
