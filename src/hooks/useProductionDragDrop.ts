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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the full schedule item
      const { data: schedItem, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("*")
        .eq("id", scheduleItemId)
        .single();
      if (fetchErr) throw fetchErr;

      // Delete schedule item
      const { error: delErr } = await supabase
        .from("production_schedule")
        .delete()
        .eq("id", scheduleItemId);
      if (delErr) throw delErr;

      if (schedItem?.inbox_item_id) {
        // Restore existing inbox item
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({ status: "pending" })
          .eq("id", schedItem.inbox_item_id);
        if (updateErr) throw updateErr;
      } else {
        // Create a new inbox item from schedule data
        const { error: insertErr } = await supabase
          .from("production_inbox")
          .insert({
            project_id: schedItem.project_id,
            stage_id: schedItem.stage_id,
            item_name: schedItem.item_name,
            estimated_hours: schedItem.scheduled_hours,
            estimated_czk: schedItem.scheduled_czk,
            sent_by: user.id,
            status: "pending",
          });
        if (insertErr) throw insertErr;
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

  const completeItems = useCallback(async (itemIds: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("production_schedule")
        .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user.id })
        .in("id", itemIds);
      if (error) throw error;
      invalidateAll();
      toast({ title: `${itemIds.length} položek přesunuto do Expedice` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnToProduction = useCallback(async (scheduleItemId: string) => {
    try {
      const { error } = await supabase
        .from("production_schedule")
        .update({ status: "scheduled", completed_at: null, completed_by: null })
        .eq("id", scheduleItemId);
      if (error) throw error;
      invalidateAll();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const returnBundleToInbox = useCallback(async (projectId: string, weekDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all schedule items for this bundle (full data for re-creation)
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

      // Delete schedule rows
      const { error: delErr } = await supabase.from("production_schedule").delete().in("id", ids);
      if (delErr) throw delErr;

      // Restore existing inbox items
      const inboxIds = withInbox.map((i) => i.inbox_item_id).filter(Boolean) as string[];
      if (inboxIds.length > 0) {
        const { error: updateErr } = await supabase
          .from("production_inbox")
          .update({ status: "pending" })
          .in("id", inboxIds);
        if (updateErr) throw updateErr;
      }

      // Create new inbox items for those without inbox_item_id
      if (withoutInbox.length > 0) {
        const newItems = withoutInbox.map((item) => ({
          project_id: item.project_id,
          stage_id: item.stage_id,
          item_name: item.item_name,
          estimated_hours: item.scheduled_hours,
          estimated_czk: item.scheduled_czk,
          sent_by: user.id,
          status: "pending" as const,
        }));
        const { error: insertErr } = await supabase.from("production_inbox").insert(newItems);
        if (insertErr) throw insertErr;
      }

      invalidateAll();
      toast({ title: `${items.length} položek vráceno do Inboxu` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [invalidateAll]);

  const mergeSplitItems = useCallback(async (splitGroupId: string) => {
    try {
      // Find all parts with this split_group_id, plus the original
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
      const primary = parts[0]; // Part 1

      // Clean name: remove (X/Y) suffix
      const cleanName = primary.item_name.replace(/\s*\(\d+\/\d+\)$/, "");

      // Update Part 1 with merged totals, clear split fields
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

      // Delete all other parts
      const otherIds = parts.filter(p => p.id !== primary.id).map(p => p.id);
      if (otherIds.length > 0) {
        const { error: delErr } = await supabase
          .from("production_schedule")
          .delete()
          .in("id", otherIds);
        if (delErr) throw delErr;
      }

      invalidateAll();
      toast({ title: `${parts.length} částí spojeno zpět do "${cleanName}" (${totalHours}h)` });
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
    completeItems,
    returnToProduction,
    returnBundleToInbox,
    mergeSplitItems,
  };
}
