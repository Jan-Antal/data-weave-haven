import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback } from "react";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { logActivity } from "@/lib/activityLog";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";

function weekLabel(weekDate: string): string {
  try {
    const d = new Date(weekDate);
    return `T${getISOWeekNumber(d)}`;
  } catch { return weekDate; }
}

export function useProductionDragDrop() {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
    qc.invalidateQueries({ queryKey: ["production-progress"] });
  }, [qc]);

  const moveInboxItemToWeek = useCallback(async (inboxItemId: string, weekDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: item, error: fetchErr } = await supabase
        .from("production_inbox")
        .select("*")
        .eq("id", inboxItemId)
        .single();
      if (fetchErr || !item) throw fetchErr || new Error("Item not found");

      const { data: inserted, error: insertErr } = await supabase.from("production_schedule").insert({
        project_id: item.project_id,
        stage_id: item.stage_id,
        item_name: item.item_name,
        item_code: item.item_code,
        scheduled_week: weekDate,
        scheduled_hours: item.estimated_hours,
        scheduled_czk: item.estimated_czk,
        position: 999,
        status: "scheduled",
        created_by: user.id,
        inbox_item_id: item.id,
      }).select().single();
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from("production_inbox")
        .update({ status: "scheduled" })
        .eq("id", inboxItemId);
      if (updateErr) throw updateErr;

      // Log activity
      logActivity({
        projectId: item.project_id,
        actionType: "item_scheduled",
        oldValue: "Inbox",
        newValue: weekLabel(weekDate),
        detail: JSON.stringify({ item_name: item.item_name, item_code: item.item_code, week: weekLabel(weekDate), scheduled_hours: item.estimated_hours, scheduled_czk: item.estimated_czk }),
      });

      invalidateAll();

      // Push undo
      if (inserted) {
        pushUndo({
          page: "plan-vyroby",
          actionType: "inbox_to_silo",
          description: `Přesun ${item.item_name} → T${weekDate}`,
          undo: async () => {
            await supabase.from("production_schedule").delete().eq("id", inserted.id);
            await supabase.from("production_inbox").update({ status: "pending" }).eq("id", inboxItemId);
            invalidateAll();
          },
          redo: async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            await supabase.from("production_schedule").insert({
              project_id: item.project_id, stage_id: item.stage_id,
              item_name: item.item_name, item_code: item.item_code,
              scheduled_week: weekDate, scheduled_hours: item.estimated_hours,
              scheduled_czk: item.estimated_czk, position: 999, status: "scheduled",
              created_by: u?.id || user.id, inbox_item_id: item.id,
            });
            await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", inboxItemId);
            invalidateAll();
          },
        });
      }
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  const moveInboxProjectToWeek = useCallback(async (projectId: string, weekDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: items, error: fetchErr } = await supabase
        .from("production_inbox")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "pending");
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;

      const scheduleRows = items.map((item, i) => ({
        project_id: item.project_id,
        stage_id: item.stage_id,
        item_name: item.item_name,
        item_code: item.item_code,
        scheduled_week: weekDate,
        scheduled_hours: item.estimated_hours,
        scheduled_czk: item.estimated_czk,
        position: i,
        status: "scheduled" as const,
        created_by: user.id,
        inbox_item_id: item.id,
      }));

      const { data: inserted, error: insertErr } = await supabase.from("production_schedule").insert(scheduleRows).select();
      if (insertErr) throw insertErr;

      const ids = items.map((i) => i.id);
      const { error: updateErr } = await supabase
        .from("production_inbox")
        .update({ status: "scheduled" })
        .in("id", ids);
      if (updateErr) throw updateErr;

      // Log activity for each item
      for (const item of items) {
        logActivity({
          projectId: item.project_id,
          actionType: "item_scheduled",
          oldValue: "Inbox",
          newValue: weekLabel(weekDate),
          detail: JSON.stringify({ item_name: item.item_name, item_code: item.item_code, week: weekLabel(weekDate), scheduled_hours: item.estimated_hours, scheduled_czk: item.estimated_czk }),
        });
      }

      invalidateAll();

      const insertedIds = (inserted || []).map((r: any) => r.id);
      pushUndo({
        page: "plan-vyroby",
        actionType: "inbox_project_to_silo",
        description: `Přesun projektu ${projectId} → T${weekDate}`,
        undo: async () => {
          if (insertedIds.length) await supabase.from("production_schedule").delete().in("id", insertedIds);
          await supabase.from("production_inbox").update({ status: "pending" }).in("id", ids);
          invalidateAll();
        },
        redo: async () => {
          const { data: { user: u } } = await supabase.auth.getUser();
          const rows = items.map((item, i) => ({
            project_id: item.project_id, stage_id: item.stage_id,
            item_name: item.item_name, item_code: item.item_code,
            scheduled_week: weekDate, scheduled_hours: item.estimated_hours,
            scheduled_czk: item.estimated_czk, position: i, status: "scheduled" as const,
            created_by: u?.id || user.id, inbox_item_id: item.id,
          }));
          await supabase.from("production_schedule").insert(rows);
          await supabase.from("production_inbox").update({ status: "scheduled" }).in("id", ids);
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  const moveScheduleItemToWeek = useCallback(async (scheduleItemId: string, newWeekDate: string) => {
    try {
      // Capture old week for undo
      const { data: oldItem } = await supabase.from("production_schedule").select("scheduled_week, item_name, project_id, item_code").eq("id", scheduleItemId).single();
      const oldWeek = oldItem?.scheduled_week;

      const { error } = await supabase
        .from("production_schedule")
        .update({ scheduled_week: newWeekDate })
        .eq("id", scheduleItemId);
      if (error) throw error;
      // Log activity
      if (oldItem) {
        logActivity({
          projectId: oldItem.project_id || "",
          actionType: "item_moved",
          oldValue: weekLabel(oldWeek || ""),
          newValue: weekLabel(newWeekDate),
          detail: JSON.stringify({ item_name: oldItem.item_name, from_week: weekLabel(oldWeek || ""), to_week: weekLabel(newWeekDate) }),
        });
      }

      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "move_silo_item",
        description: `Přesun ${oldItem?.item_name || "položky"} → T${newWeekDate}`,
        undo: async () => {
          await supabase.from("production_schedule").update({ scheduled_week: oldWeek }).eq("id", scheduleItemId);
          invalidateAll();
        },
        redo: async () => {
          await supabase.from("production_schedule").update({ scheduled_week: newWeekDate }).eq("id", scheduleItemId);
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  const moveBundleToWeek = useCallback(async (projectId: string, sourceWeekDate: string, targetWeekDate: string) => {
    try {
      const { error } = await supabase
        .from("production_schedule")
        .update({ scheduled_week: targetWeekDate })
        .eq("project_id", projectId)
        .eq("scheduled_week", sourceWeekDate)
        .in("status", ["scheduled", "in_progress"]);
      if (error) throw error;
      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "move_bundle",
        description: `Přesun balíku ${projectId} → T${targetWeekDate}`,
        undo: async () => {
          await supabase.from("production_schedule")
            .update({ scheduled_week: sourceWeekDate })
            .eq("project_id", projectId)
            .eq("scheduled_week", targetWeekDate)
            .in("status", ["scheduled", "in_progress"]);
          invalidateAll();
        },
        redo: async () => {
          await supabase.from("production_schedule")
            .update({ scheduled_week: targetWeekDate })
            .eq("project_id", projectId)
            .eq("scheduled_week", sourceWeekDate)
            .in("status", ["scheduled", "in_progress"]);
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  const moveItemBackToInbox = useCallback(async (scheduleItemId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: schedItem, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("*")
        .eq("id", scheduleItemId)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: delErr } = await supabase
        .from("production_schedule")
        .delete()
        .eq("id", scheduleItemId);
      if (delErr) throw delErr;

      if (schedItem?.inbox_item_id) {
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({ status: "pending" })
          .eq("id", schedItem.inbox_item_id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from("production_inbox")
          .insert({
            project_id: schedItem.project_id,
            stage_id: schedItem.stage_id,
            item_name: schedItem.item_name,
            item_code: schedItem.item_code,
            estimated_hours: schedItem.scheduled_hours,
            estimated_czk: schedItem.scheduled_czk,
            sent_by: user.id,
            status: "pending",
          });
        if (insertErr) throw insertErr;
      }

      // Log activity
      logActivity({
        projectId: schedItem.project_id,
        actionType: "item_returned_to_inbox",
        oldValue: weekLabel(schedItem.scheduled_week),
        newValue: "Inbox",
        detail: JSON.stringify({ item_name: schedItem.item_name, item_code: schedItem.item_code, from_week: weekLabel(schedItem.scheduled_week) }),
      });

      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "return_to_inbox",
        description: `Vrácení ${schedItem.item_name} do Inboxu`,
        undo: async () => {
          // Re-schedule item
          const { data: { user: u } } = await supabase.auth.getUser();
          await supabase.from("production_schedule").insert({
            project_id: schedItem.project_id, stage_id: schedItem.stage_id,
            item_name: schedItem.item_name, item_code: schedItem.item_code,
            scheduled_week: schedItem.scheduled_week, scheduled_hours: schedItem.scheduled_hours,
            scheduled_czk: schedItem.scheduled_czk, position: schedItem.position,
            status: "scheduled", created_by: u?.id || user.id,
            inbox_item_id: schedItem.inbox_item_id,
          });
          if (schedItem.inbox_item_id) {
            await supabase.from("production_inbox").update({ status: "scheduled" }).eq("id", schedItem.inbox_item_id);
          }
          invalidateAll();
        },
        redo: async () => {
          // Re-do the return to inbox (simplified: just call the same logic)
          const { data: { user: u } } = await supabase.auth.getUser();
          // Find the re-created schedule item by matching
          const { data: reItems } = await supabase.from("production_schedule")
            .select("id, inbox_item_id")
            .eq("project_id", schedItem.project_id)
            .eq("item_name", schedItem.item_name)
            .eq("scheduled_week", schedItem.scheduled_week)
            .limit(1);
          if (reItems && reItems[0]) {
            await supabase.from("production_schedule").delete().eq("id", reItems[0].id);
            if (reItems[0].inbox_item_id) {
              await supabase.from("production_inbox").update({ status: "pending" }).eq("id", reItems[0].inbox_item_id);
            }
          }
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  const reorderItemsInWeek = useCallback(async (weekDate: string, orderedItemIds: string[]) => {
    try {
      // Capture old order for undo
      const { data: oldItems } = await supabase.from("production_schedule")
        .select("id, position")
        .in("id", orderedItemIds);
      const oldOrder = (oldItems || []).sort((a, b) => a.position - b.position).map(i => i.id);

      const updates = orderedItemIds.map((id, i) =>
        supabase.from("production_schedule").update({ position: i }).eq("id", id)
      );
      await Promise.all(updates);
      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "reorder",
        description: "Změna pořadí položek",
        undo: async () => {
          const restores = oldOrder.map((id, i) =>
            supabase.from("production_schedule").update({ position: i }).eq("id", id)
          );
          await Promise.all(restores);
          invalidateAll();
        },
        redo: async () => {
          const reapply = orderedItemIds.map((id, i) =>
            supabase.from("production_schedule").update({ position: i }).eq("id", id)
          );
          await Promise.all(reapply);
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll, pushUndo]);

  const completeItems = useCallback(async (itemIds: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Capture old statuses for undo
      const { data: oldItems } = await supabase.from("production_schedule")
        .select("id, status, completed_at, completed_by, item_name, item_code, project_id, scheduled_week")
        .in("id", itemIds);

      const { error } = await supabase
        .from("production_schedule")
        .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user.id })
        .in("id", itemIds);
      if (error) throw error;

      // Log activity
      for (const old of (oldItems || [])) {
        logActivity({
          projectId: old.project_id,
          actionType: "item_completed",
          oldValue: "Naplánováno",
          newValue: "Dokončeno",
          detail: JSON.stringify({ item_name: old.item_name, item_code: old.item_code, week: weekLabel(old.scheduled_week), completed_at: new Date().toISOString() }),
        });
      }

      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "complete_items",
        description: `${itemIds.length} položek → Expedice`,
        undo: async () => {
          // Restore previous statuses
          for (const old of (oldItems || [])) {
            await supabase.from("production_schedule")
              .update({ status: old.status, completed_at: old.completed_at, completed_by: old.completed_by })
              .eq("id", old.id);
          }
          invalidateAll();
        },
        redo: async () => {
          const { data: { user: u } } = await supabase.auth.getUser();
          await supabase.from("production_schedule")
            .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: u?.id })
            .in("id", itemIds);
          invalidateAll();
        },
      });

      // Toast is shown by pushUndo
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll, pushUndo]);

  const returnToProduction = useCallback(async (scheduleItemId: string) => {
    try {
      const { data: oldItem } = await supabase.from("production_schedule")
        .select("status, completed_at, completed_by, item_name")
        .eq("id", scheduleItemId).single();

      const { error } = await supabase
        .from("production_schedule")
        .update({ status: "scheduled", completed_at: null, completed_by: null })
        .eq("id", scheduleItemId);
      if (error) throw error;
      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "return_to_production",
        description: `Vrácení ${oldItem?.item_name || "položky"} do výroby`,
        undo: async () => {
          await supabase.from("production_schedule")
            .update({ status: oldItem?.status || "completed", completed_at: oldItem?.completed_at, completed_by: oldItem?.completed_by })
            .eq("id", scheduleItemId);
          invalidateAll();
        },
        redo: async () => {
          await supabase.from("production_schedule")
            .update({ status: "scheduled", completed_at: null, completed_by: null })
            .eq("id", scheduleItemId);
          invalidateAll();
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll, pushUndo]);

  const returnBundleToInbox = useCallback(async (projectId: string, weekDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: items, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("*")
        .eq("project_id", projectId)
        .eq("scheduled_week", weekDate)
        .in("status", ["scheduled", "in_progress"]);
      if (fetchErr) throw fetchErr;
      if (!items || items.length === 0) return;

      const ids = items.map((i) => i.id);
      const withInbox = items.filter((i) => i.inbox_item_id);
      const withoutInbox = items.filter((i) => !i.inbox_item_id);

      const { error: delErr } = await supabase.from("production_schedule").delete().in("id", ids);
      if (delErr) throw delErr;

      const inboxIds = withInbox.map((i) => i.inbox_item_id).filter(Boolean) as string[];
      if (inboxIds.length > 0) {
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({ status: "pending" })
          .in("id", inboxIds);
        if (updateErr) throw updateErr;
      }

      if (withoutInbox.length > 0) {
        const newItems = withoutInbox.map((item) => ({
          project_id: item.project_id,
          stage_id: item.stage_id,
          item_name: item.item_name,
          item_code: item.item_code,
          estimated_hours: item.scheduled_hours,
          estimated_czk: item.scheduled_czk,
          sent_by: user.id,
          status: "pending" as const,
        }));
        const { error: insertErr } = await supabase.from("production_inbox").insert(newItems);
        if (insertErr) throw insertErr;
      }

      invalidateAll();

      pushUndo({
        page: "plan-vyroby",
        actionType: "return_bundle_to_inbox",
        description: `${items.length} položek vráceno do Inboxu`,
        undo: async () => {
          // Re-schedule all items
          const { data: { user: u } } = await supabase.auth.getUser();
          const rows = items.map((item) => ({
            project_id: item.project_id, stage_id: item.stage_id,
            item_name: item.item_name, item_code: item.item_code,
            scheduled_week: item.scheduled_week, scheduled_hours: item.scheduled_hours,
            scheduled_czk: item.scheduled_czk, position: item.position,
            status: item.status, created_by: u?.id || user.id,
            inbox_item_id: item.inbox_item_id,
          }));
          await supabase.from("production_schedule").insert(rows);
          if (inboxIds.length) await supabase.from("production_inbox").update({ status: "scheduled" }).in("id", inboxIds);
          invalidateAll();
        },
        redo: async () => {
          // Simplified: just move them back
          const { data: reItems } = await supabase.from("production_schedule")
            .select("id").eq("project_id", projectId).eq("scheduled_week", weekDate)
            .in("status", ["scheduled", "in_progress"]);
          if (reItems && reItems.length) {
            const reIds = reItems.map(i => i.id);
            await supabase.from("production_schedule").delete().in("id", reIds);
          }
          if (inboxIds.length) await supabase.from("production_inbox").update({ status: "pending" }).in("id", inboxIds);
          invalidateAll();
        },
      });

      // Toast is shown by pushUndo
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll, pushUndo]);

  const mergeSplitItems = useCallback(async (splitGroupId: string) => {
    try {
      const { data: parts, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("*")
        .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
        .order("split_part", { ascending: true });
      if (fetchErr) throw fetchErr;
      if (!parts || parts.length <= 1) {
        toast({ title: "Není co spojit", description: "Nebyla nalezena žádná další část." });
        return;
      }

      const totalHours = parts.reduce((s, p) => s + p.scheduled_hours, 0);
      const totalCzk = parts.reduce((s, p) => s + p.scheduled_czk, 0);
      const primary = parts[0];
      const cleanName = primary.item_name.replace(/\s*\(\d+\/\d+\)$/, "");

      const { error: updateErr } = await supabase
        .from("production_schedule")
        .update({
          scheduled_hours: totalHours,
          scheduled_czk: totalCzk,
          item_name: cleanName,
          split_group_id: null,
          split_part: null,
          split_total: null,
        })
        .eq("id", primary.id);
      if (updateErr) throw updateErr;

      const otherIds = parts.filter(p => p.id !== primary.id).map(p => p.id);
      if (otherIds.length > 0) {
        const { error: delErr } = await supabase
          .from("production_schedule")
          .delete()
          .in("id", otherIds);
        if (delErr) throw delErr;
      }

      invalidateAll();

      // Store parts snapshot for undo
      const partsSnapshot = parts.map(p => ({ ...p }));
      pushUndo({
        page: "plan-vyroby",
        actionType: "merge_split",
        description: `${parts.length} částí spojeno → "${cleanName}"`,
        undo: async () => {
          // Restore primary to its original state
          const orig = partsSnapshot[0];
          await supabase.from("production_schedule").update({
            scheduled_hours: orig.scheduled_hours, scheduled_czk: orig.scheduled_czk,
            item_name: orig.item_name, split_group_id: orig.split_group_id,
            split_part: orig.split_part, split_total: orig.split_total,
          }).eq("id", orig.id);
          // Re-create other parts
          const { data: { user } } = await supabase.auth.getUser();
          const others = partsSnapshot.slice(1).map(p => ({
            project_id: p.project_id, stage_id: p.stage_id,
            item_name: p.item_name, item_code: p.item_code,
            scheduled_week: p.scheduled_week, scheduled_hours: p.scheduled_hours,
            scheduled_czk: p.scheduled_czk, position: p.position,
            status: p.status, created_by: user?.id,
            split_group_id: p.split_group_id, split_part: p.split_part, split_total: p.split_total,
          }));
          if (others.length) await supabase.from("production_schedule").insert(others);
          invalidateAll();
        },
        redo: async () => {
          // Re-merge
          await supabase.from("production_schedule").update({
            scheduled_hours: totalHours, scheduled_czk: totalCzk,
            item_name: cleanName, split_group_id: null, split_part: null, split_total: null,
          }).eq("id", primary.id);
          // Find and delete other parts
          const { data: reParts } = await supabase.from("production_schedule")
            .select("id").or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
            .neq("id", primary.id);
          if (reParts && reParts.length) {
            await supabase.from("production_schedule").delete().in("id", reParts.map(p => p.id));
          }
          invalidateAll();
        },
      });

      // Toast is shown by pushUndo
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll, pushUndo]);

  return {
    moveInboxItemToWeek,
    moveInboxProjectToWeek,
    moveScheduleItemToWeek,
    moveBundleToWeek,
    moveItemBackToInbox,
    reorderItemsInWeek,
    completeItems,
    returnToProduction,
    returnBundleToInbox,
    mergeSplitItems,
  };
}
