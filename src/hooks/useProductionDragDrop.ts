import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback } from "react";

export function useProductionDragDrop() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
  }, [qc]);

  const moveInboxItemToWeek = useCallback(async (inboxItemId: string, weekDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch inbox item
      const { data: item, error: fetchErr } = await supabase
        .from("production_inbox")
        .select("*")
        .eq("id", inboxItemId)
        .single();
      if (fetchErr || !item) throw fetchErr || new Error("Item not found");

      // Insert into schedule
      const { error: insertErr } = await supabase.from("production_schedule").insert({
        project_id: item.project_id,
        stage_id: item.stage_id,
        item_name: item.item_name,
        scheduled_week: weekDate,
        scheduled_hours: item.estimated_hours,
        scheduled_czk: item.estimated_czk,
        position: 999,
        status: "scheduled",
        created_by: user.id,
        inbox_item_id: item.id,
      });
      if (insertErr) throw insertErr;

      // Mark inbox item as scheduled
      const { error: updateErr } = await supabase
        .from("production_inbox")
        .update({ status: "scheduled" })
        .eq("id", inboxItemId);
      if (updateErr) throw updateErr;

      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll]);

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
        scheduled_week: weekDate,
        scheduled_hours: item.estimated_hours,
        scheduled_czk: item.estimated_czk,
        position: i,
        status: "scheduled" as const,
        created_by: user.id,
        inbox_item_id: item.id,
      }));

      const { error: insertErr } = await supabase.from("production_schedule").insert(scheduleRows);
      if (insertErr) throw insertErr;

      const ids = items.map((i) => i.id);
      const { error: updateErr } = await supabase
        .from("production_inbox")
        .update({ status: "scheduled" })
        .in("id", ids);
      if (updateErr) throw updateErr;

      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll]);

  const moveScheduleItemToWeek = useCallback(async (scheduleItemId: string, newWeekDate: string) => {
    try {
      const { error } = await supabase
        .from("production_schedule")
        .update({ scheduled_week: newWeekDate })
        .eq("id", scheduleItemId);
      if (error) throw error;
      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll]);

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
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll]);

  const moveItemBackToInbox = useCallback(async (scheduleItemId: string) => {
    try {
      // Get the schedule item to find the inbox_item_id
      const { data: schedItem, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("inbox_item_id")
        .eq("id", scheduleItemId)
        .single();
      if (fetchErr) throw fetchErr;

      // Delete schedule item
      const { error: delErr } = await supabase
        .from("production_schedule")
        .delete()
        .eq("id", scheduleItemId);
      if (delErr) throw delErr;

      // If linked to inbox item, restore it
      if (schedItem?.inbox_item_id) {
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({ status: "pending" })
          .eq("id", schedItem.inbox_item_id);
        if (updateErr) throw updateErr;
      }

      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll]);

  const reorderItemsInWeek = useCallback(async (weekDate: string, orderedItemIds: string[]) => {
    try {
      const updates = orderedItemIds.map((id, i) =>
        supabase.from("production_schedule").update({ position: i }).eq("id", id)
      );
      await Promise.all(updates);
      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  return {
    moveInboxItemToWeek,
    moveInboxProjectToWeek,
    moveScheduleItemToWeek,
    moveBundleToWeek,
    moveItemBackToInbox,
    reorderItemsInWeek,
  };
}
