import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useAuth } from "@/hooks/useAuth";
import { createNotification, createOrUpdateBatchNotification, resolvePersonToUserId, getUserIdsByRole } from "@/lib/createNotification";

export type TPVItem = Tables<"tpv_items"> & { konstrukter?: string | null; nazev_prvku?: string | null };

export function useTPVItems(projectId: string) {
  return useQuery({
    queryKey: ["tpv_items", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_items")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data as TPVItem[];
    },
    enabled: !!projectId,
  });
}

export function useUpdateTPVItem() {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, field, value, oldValue, projectId }: { id: string; field: string; value: any; projectId: string; oldValue?: string }) => {
      // Fetch item before update for notification context
      const { data: itemBefore } = await supabase.from("tpv_items").select("*").eq("id", id).single();
      const { error } = await supabase.from("tpv_items").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
      return { id, field, value, oldValue, itemBefore };
    },
    onSuccess: (result, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      const { id, field, value, oldValue, itemBefore } = result;

      if (oldValue !== undefined) {
        pushUndo({
          page: "tpv-list",
          actionType: "inline_edit",
          description: `Úprava ${field}: "${oldValue || "—"}" → "${value || "—"}"`,
          undoPayload: {
            table: "tpv_items",
            operation: "update",
            records: [{ id, [field]: oldValue }],
            queryKeys: [["tpv_items", projectId]],
          },
          redoPayload: {
            table: "tpv_items",
            operation: "update",
            records: [{ id, [field]: value }],
            queryKeys: [["tpv_items", projectId]],
          },
          undo: async () => {
            await supabase.from("tpv_items").update({ [field]: oldValue } as any).eq("id", id);
            qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
          },
          redo: async () => {
            await supabase.from("tpv_items").update({ [field]: value } as any).eq("id", id);
            qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
          },
        });
      }

      toast({ title: "Uloženo", duration: 2000 });

      // --- Konstruktér notifications (fire-and-forget) ---
      if (!user || !profile) return;
      const actorName = profile.full_name || profile.email || "";

      (async () => {
        try {
          const kodPrvku = (itemBefore as any)?.item_name || "";

          // Konstruktér assignment change
          if (field === "konstrukter" && value !== oldValue) {
            // Notify NEW konstruktér
            if (value) {
              const newUserId = await resolvePersonToUserId(supabase, value);
              if (newUserId && newUserId !== user.id) {
                await createOrUpdateBatchNotification(supabase, {
                  userIds: [newUserId],
                  type: "konstrukter_assigned",
                  titleTemplate: `Bol si priradený na {count} prvok/prvky v projekte ${projectId}`,
                  projectId,
                  actorName,
                  excludeUserId: user.id,
                  linkContext: { tab: "tpv-list", project_id: projectId },
                  batchKey: `konstrukter_assigned:${projectId}:${user.id}`,
                  batchWindowMinutes: 5,
                });
              }
            }
            // Notify OLD konstruktér (removed)
            if (oldValue) {
              const oldUserId = await resolvePersonToUserId(supabase, oldValue);
              if (oldUserId && oldUserId !== user.id) {
                await createNotification(supabase, {
                  userIds: [oldUserId],
                  type: "konstrukter_removed",
                  title: `Bol si odobraný z prvku ${kodPrvku} na projekte ${projectId}`,
                  projectId,
                  actorName,
                  excludeUserId: user.id,
                  linkContext: { tab: "tpv-list", project_id: projectId, item_id: id },
                });
              }
            }
          }

          // Status change — notify assigned konstruktér
          if (field === "status" && value !== oldValue && (itemBefore as any)?.konstrukter) {
            const kUserId = await resolvePersonToUserId(supabase, (itemBefore as any).konstrukter);
            if (kUserId && kUserId !== user.id) {
              await createNotification(supabase, {
                userIds: [kUserId],
                type: "konstrukter_item_changed",
                title: `Prvok ${kodPrvku} na ${projectId}: status zmenený na ${value}`,
                projectId,
                actorName,
                excludeUserId: user.id,
                linkContext: { tab: "tpv-list", project_id: projectId, item_id: id },
              });
            }
          }

          // Pocet change — notify assigned konstruktér
          if (field === "pocet" && value !== oldValue && (itemBefore as any)?.konstrukter) {
            const kUserId = await resolvePersonToUserId(supabase, (itemBefore as any).konstrukter);
            if (kUserId && kUserId !== user.id) {
              await createNotification(supabase, {
                userIds: [kUserId],
                type: "konstrukter_item_changed",
                title: `Prvok ${kodPrvku} na ${projectId}: počet zmenený ${oldValue || "—"} → ${value || "—"}`,
                projectId,
                actorName,
                excludeUserId: user.id,
                linkContext: { tab: "tpv-list", project_id: projectId, item_id: id },
              });
            }
          }

          // Notes change — notify assigned konstruktér
          if (field === "notes" && value !== oldValue && (itemBefore as any)?.konstrukter) {
            const kUserId = await resolvePersonToUserId(supabase, (itemBefore as any).konstrukter);
            if (kUserId && kUserId !== user.id) {
              const truncBody = String(value || "").slice(0, 100);
              await createNotification(supabase, {
                userIds: [kUserId],
                type: "konstrukter_item_changed",
                title: `Nová poznámka na prvku ${kodPrvku} (${projectId})`,
                body: truncBody,
                projectId,
                actorName,
                excludeUserId: user.id,
                linkContext: { tab: "tpv-list", project_id: projectId, item_id: id },
              });
            }
          }
        } catch {
          // Silent fail for notifications
        }
      })();
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}

export function useAddTPVItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { project_id: string; item_name: string; item_type?: string; status?: string; sent_date?: string; accepted_date?: string; notes?: string }) => {
      const { data, error } = await supabase.from("tpv_items").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { project_id }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", project_id] });
      toast({ title: "Položka přidána" });
    },
    onError: () => {
      toast({ title: "Chyba", variant: "destructive" });
    },
  });
}

export function useDeleteTPVItems() {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({ ids, projectId }: { ids: string[]; projectId: string }) => {
      const { data: rows } = await supabase.from("tpv_items").select("*").in("id", ids);
      const { error } = await supabase.from("tpv_items").update({ deleted_at: new Date().toISOString() } as any).in("id", ids);
      if (error) throw error;
      return { projectId, rows: rows || [], ids };
    },
    onSuccess: ({ projectId, rows, ids }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });

      pushUndo({
        page: "tpv-list",
        actionType: "delete_rows",
        description: `Smazáno ${ids.length} položek`,
        undoPayload: {
          table: "tpv_items",
          operation: "update",
          records: ids.map(id => ({ id, deleted_at: null })),
          queryKeys: [["tpv_items", projectId]],
        },
        redoPayload: {
          table: "tpv_items",
          operation: "update",
          records: ids.map(id => ({ id, deleted_at: new Date().toISOString() })),
          queryKeys: [["tpv_items", projectId]],
        },
        undo: async () => {
          await supabase.from("tpv_items").update({ deleted_at: null } as any).in("id", ids);
          qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
        },
        redo: async () => {
          await supabase.from("tpv_items").update({ deleted_at: new Date().toISOString() } as any).in("id", ids);
          qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
        },
      });

      toast({ title: "Smazáno" });

      // Notify PM about deleted items (fire-and-forget)
      if (user && profile) {
        (async () => {
          try {
            // Get project PM
            const { data: proj } = await (supabase as any)
              .from("projects")
              .select("pm, project_name")
              .eq("project_id", projectId)
              .single();
            if (!proj?.pm) return;
            const pmUserId = await resolvePersonToUserId(supabase, proj.pm);
            if (!pmUserId || pmUserId === user.id) return;
            await createOrUpdateBatchNotification(supabase, {
              userIds: [pmUserId],
              type: "tpv_items_removed",
              titleTemplate: `Na projekte ${projectId} bolo odobraných {count} položiek`,
              body: proj.project_name,
              projectId,
              actorName: profile.full_name || profile.email || "",
              excludeUserId: user.id,
              linkContext: { tab: "tpv-list", project_id: projectId },
              batchKey: `tpv_removed:${projectId}:${user.id}`,
              batchWindowMinutes: 5,
            });
          } catch {}
        })();
      }
    },
  });
}

export function useBulkUpdateTPVStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status, projectId }: { ids: string[]; status: string; projectId: string }) => {
      const { error } = await supabase.from("tpv_items").update({ status }).in("id", ids);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({ title: "Status aktualizován" });
    },
  });
}

export function useBulkInsertTPVItems() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({ items, projectId }: { items: { project_id: string; item_name: string; item_type?: string; status?: string; sent_date?: string; accepted_date?: string; notes?: string }[]; projectId: string }) => {
      const { error } = await supabase.from("tpv_items").insert(items);
      if (error) throw error;
      return { projectId, count: items.length };
    },
    onSuccess: ({ projectId, count }) => {
      qc.invalidateQueries({ queryKey: ["tpv_items", projectId] });
      toast({ title: "Import dokončen" });

      // Notify PM about added items (fire-and-forget)
      if (user && profile) {
        (async () => {
          try {
            const { data: proj } = await (supabase as any)
              .from("projects")
              .select("pm, project_name")
              .eq("project_id", projectId)
              .single();
            if (!proj?.pm) return;
            const pmUserId = await resolvePersonToUserId(supabase, proj.pm);
            if (!pmUserId || pmUserId === user.id) return;
            await createOrUpdateBatchNotification(supabase, {
              userIds: [pmUserId],
              type: "tpv_items_added",
              titleTemplate: `Na projekte ${projectId} bolo pridaných {count} nových položiek`,
              body: proj.project_name,
              projectId,
              actorName: profile.full_name || profile.email || "",
              excludeUserId: user.id,
              linkContext: { tab: "tpv-list", project_id: projectId },
              batchKey: `tpv_added:${projectId}:${user.id}`,
              batchWindowMinutes: 5,
            });
          } catch {}
        })();
      }
    },
  });
}
