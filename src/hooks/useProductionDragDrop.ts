import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback } from "react";
import { useUndoRedo, type UndoEntry } from "@/hooks/useUndoRedo";
import { logActivity } from "@/lib/activityLog";
import { getISOWeekNumber } from "@/hooks/useProductionSchedule";
import { autoUpdateProjectPercents } from "@/lib/autoProjectPercent";
import { renumberChain, renumberBundleChain } from "@/lib/splitChainHelpers";

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
        split_group_id: item.split_group_id ?? null,
        split_part: item.split_part ?? null,
        split_total: item.split_total ?? null,
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

      // If item is part of a chain, renumber so badges stay consistent.
      if (item.split_group_id) {
        try { await renumberChain(item.split_group_id); } catch { /* silent */ }
      }

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
              split_group_id: item.split_group_id ?? null,
              split_part: item.split_part ?? null,
              split_total: item.split_total ?? null,
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
        split_group_id: item.split_group_id ?? null,
        split_part: item.split_part ?? null,
        split_total: item.split_total ?? null,
      }));

      // Pre-flight: check for existing items with same item_code already scheduled in target week
      const itemCodes = items.map((i) => i.item_code).filter(Boolean) as string[];
      if (itemCodes.length > 0) {
        const { data: collisions } = await supabase
          .from("production_schedule")
          .select("item_code")
          .eq("project_id", projectId)
          .eq("scheduled_week", weekDate)
          .in("item_code", itemCodes);
        if (collisions && collisions.length > 0) {
          const codes = Array.from(new Set(collisions.map((c: any) => c.item_code))).join(", ");
          toast({
            title: "Položky už jsou v tomto týdnu",
            description: `${codes} – nelze vložit duplicitně do T${weekLabel(weekDate).replace("T", "")}. Zkontrolujte Inbox / TPV.`,
            variant: "destructive",
          });
          return;
        }
      }

      const { data: inserted, error: insertErr } = await supabase.from("production_schedule").insert(scheduleRows).select();
      if (insertErr) {
        if (insertErr.code === "23505" || /production_schedule_item_week_unique|duplicate key/i.test(insertErr.message || "")) {
          toast({
            title: "Duplicitní položka",
            description: `Některá z položek už existuje v T${weekLabel(weekDate).replace("T", "")}. Smažte duplicitu v Inboxu nebo TPV a zkuste znovu.`,
            variant: "destructive",
          });
          return;
        }
        throw insertErr;
      }

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

      // Renumber any chains touched by this bulk move.
      const chainIds = new Set(items.map((i: any) => i.split_group_id).filter(Boolean) as string[]);
      for (const g of chainIds) {
        try { await renumberChain(g); } catch { /* silent */ }
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
            split_group_id: item.split_group_id ?? null,
            split_part: item.split_part ?? null,
            split_total: item.split_total ?? null,
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

  const moveScheduleItemToWeek = useCallback(async (
    scheduleItemId: string,
    newWeekDate: string,
    onConflict?: 'merge' | 'separate',
  ): Promise<{ conflict: true; targetWeek: string; conflictType: 'split_sibling' | 'duplicate_key' } | void> => {
    try {
      // OPTIMIZATION 1: Fetch oldItem and all target-week items in parallel
      const [{ data: oldItem }, { data: allTargetItems }] = await Promise.all([
        supabase.from("production_schedule").select("*").eq("id", scheduleItemId).single(),
        supabase.from("production_schedule").select("*").eq("scheduled_week", newWeekDate).in("status", ["scheduled", "in_progress"]),
      ]);
      if (!oldItem) throw new Error("Item not found");
      const oldWeek = oldItem.scheduled_week;

      // Filter target siblings from pre-fetched data instead of a second query
      if (oldItem.split_group_id) {
        const targetSiblings = (allTargetItems || []).filter(t =>
          t.id !== scheduleItemId &&
          (t.split_group_id === oldItem.split_group_id || t.id === oldItem.split_group_id)
        );

        if (targetSiblings && targetSiblings.length > 0) {
          // If no conflict resolution specified, return conflict signal
          if (!onConflict) {
            return { conflict: true, targetWeek: newWeekDate, conflictType: 'split_sibling' };
          }

          if (onConflict === 'merge') {
            // Merge: add hours to existing sibling, delete dragged item
            const target = targetSiblings[0];
            const newHours = target.scheduled_hours + oldItem.scheduled_hours;
            const newCzk = target.scheduled_czk + oldItem.scheduled_czk;
            const snapshot = { ...oldItem };

            await supabase.from("production_schedule").delete().eq("id", scheduleItemId);
            await supabase.from("production_schedule").update({
              scheduled_hours: newHours,
              scheduled_czk: newCzk,
            }).eq("id", target.id);

            // Renumber remaining siblings
            const { data: remaining } = await supabase.from("production_schedule")
              .select("id, scheduled_week")
              .or(`split_group_id.eq.${oldItem.split_group_id},id.eq.${oldItem.split_group_id}`)
              .order("scheduled_week", { ascending: true });
            if (remaining && remaining.length > 1) {
              const cleanName = oldItem.item_name.replace(/\s*\(\d+\/\d+\)$/, "");
              await Promise.all(remaining.map((s, i) =>
                supabase.from("production_schedule").update({
                  item_name: `${cleanName} (${i + 1}/${remaining.length})`,
                  split_part: i + 1,
                  split_total: remaining.length,
                }).eq("id", s.id)
              ));
            } else if (remaining && remaining.length === 1) {
              const cleanName = oldItem.item_name.replace(/\s*\(\d+\/\d+\)$/, "");
              await supabase.from("production_schedule").update({
                item_name: cleanName,
                split_group_id: null, split_part: null, split_total: null,
              }).eq("id", remaining[0].id);
            }

            invalidateAll();
            toast({ title: `Položky sloučeny do ${weekLabel(newWeekDate)}` });

            pushUndo({
              page: "plan-vyroby",
              actionType: "merge_on_drop",
              description: `Sloučení do ${weekLabel(newWeekDate)}`,
              undo: async () => {
                await supabase.from("production_schedule").update({
                  scheduled_hours: target.scheduled_hours,
                  scheduled_czk: target.scheduled_czk,
                }).eq("id", target.id);
                const { data: { user } } = await supabase.auth.getUser();
                await supabase.from("production_schedule").insert({
                  project_id: snapshot.project_id, stage_id: snapshot.stage_id,
                  item_name: snapshot.item_name, item_code: snapshot.item_code,
                  scheduled_week: snapshot.scheduled_week, scheduled_hours: snapshot.scheduled_hours,
                  scheduled_czk: snapshot.scheduled_czk, position: snapshot.position,
                  status: snapshot.status, created_by: user?.id,
                  split_group_id: snapshot.split_group_id, split_part: snapshot.split_part, split_total: snapshot.split_total,
                });
                invalidateAll();
              },
              redo: async () => {
                const { data: reItem } = await supabase.from("production_schedule")
                  .select("id").eq("project_id", snapshot.project_id)
                  .eq("item_name", snapshot.item_name).eq("scheduled_week", snapshot.scheduled_week).limit(1).single();
                if (reItem) {
                  await supabase.from("production_schedule").delete().eq("id", reItem.id);
                  await supabase.from("production_schedule").update({
                    scheduled_hours: newHours, scheduled_czk: newCzk,
                  }).eq("id", target.id);
                }
                invalidateAll();
              },
            });
            return;
          }
          // onConflict === 'separate': move without mangling item_code.
          // Row identity is the uuid `id`; split parts are distinguished by split_group_id.
          if (onConflict === 'separate') {
            const { error } = await supabase
              .from("production_schedule")
              .update({
                scheduled_week: newWeekDate,
              })
              .eq("id", scheduleItemId);
            if (error) throw error;

            logActivity({
              projectId: oldItem.project_id || "",
              actionType: "item_moved",
              oldValue: weekLabel(oldWeek || ""),
              newValue: weekLabel(newWeekDate),
              detail: JSON.stringify({ item_name: oldItem.item_name, from_week: weekLabel(oldWeek || ""), to_week: weekLabel(newWeekDate) }),
            });
            invalidateAll();
            const capturedOldItemCode = oldItem.item_code;
            pushUndo({
              page: "plan-vyroby",
              actionType: "move_silo_item",
              description: `Přesun ${oldItem?.item_name || "položky"} → ${weekLabel(newWeekDate)}`,
              undo: async () => {
                await supabase.from("production_schedule").update({ scheduled_week: oldWeek, item_code: capturedOldItemCode }).eq("id", scheduleItemId);
                invalidateAll();
              },
              redo: async () => {
                await supabase.from("production_schedule").update({ scheduled_week: newWeekDate, item_code: newItemCode }).eq("id", scheduleItemId);
                invalidateAll();
              },
            });
            return;
          }
        }
      }

      // Check for duplicate key: same project_id + item_code + scheduled_week
      if (oldItem.item_code && onConflict !== 'separate') {
        // Use pre-fetched allTargetItems instead of another DB query
        const existing = (allTargetItems || []).filter(t =>
          t.project_id === oldItem.project_id &&
          t.item_code === oldItem.item_code &&
          t.id !== scheduleItemId
        ).slice(0, 1);
        if (existing && existing.length > 0) {
          if (!onConflict) {
            return { conflict: true, targetWeek: newWeekDate, conflictType: 'duplicate_key' };
          }
          // onConflict === 'merge'
          const target = existing[0];
          const newHours = target.scheduled_hours + oldItem.scheduled_hours;
          const newCzk = target.scheduled_czk + oldItem.scheduled_czk;
          await supabase.from("production_schedule").delete().eq("id", scheduleItemId);
          await supabase.from("production_schedule").update({
            scheduled_hours: newHours, scheduled_czk: newCzk,
          }).eq("id", target.id);
          invalidateAll();
          toast({ title: `Položky sloučeny do ${weekLabel(newWeekDate)}` });
          return;
        }
      }

      // Plain move
      const { error } = await supabase
        .from("production_schedule")
        .update({ scheduled_week: newWeekDate })
        .eq("id", scheduleItemId);
      if (error) throw error;

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
        description: `Přesun ${oldItem?.item_name || "položky"} → ${weekLabel(newWeekDate)}`,
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

  const moveBundleToWeek = useCallback(async (
    projectId: string,
    sourceWeekDate: string,
    targetWeekDate: string,
    onConflict?: 'merge' | 'separate',
  ): Promise<{ conflict: true; targetWeek: string; splitGroupIds: string[] } | void> => {
    try {
      // Capture items being moved
      const { data: movedItems } = await supabase
        .from("production_schedule")
        .select("*")
        .eq("project_id", projectId)
        .eq("scheduled_week", sourceWeekDate)
        .in("status", ["scheduled", "in_progress"]);
      if (!movedItems || movedItems.length === 0) return;
      const movedIds = movedItems.map(i => i.id);

      // Check for split siblings at target week
      const splitGroupIds = [...new Set(movedItems.filter(i => i.split_group_id).map(i => i.split_group_id!))];
      const mergeActions: { sourceId: string; targetId: string; addHours: number; addCzk: number; }[] = [];
      const plainMoveIds: string[] = [];
      const separateConflictIds: string[] = [];
      let hasConflict = false;

      // OPTIMIZATION 4: Parallelize splitGroupId sibling checks
      if (splitGroupIds.length > 0) {
        const siblingResults = await Promise.all(
          splitGroupIds.map(sgId =>
            supabase.from("production_schedule")
              .select("id, scheduled_hours, scheduled_czk, split_group_id")
              .eq("scheduled_week", targetWeekDate)
              .or(`split_group_id.eq.${sgId},id.eq.${sgId}`)
              .in("status", ["scheduled", "in_progress"])
              .then(({ data }) => ({ sgId, siblings: data || [] }))
          )
        );

        for (const { sgId, siblings } of siblingResults) {
          const movedWithSg = movedItems.filter(i => i.split_group_id === sgId || i.id === sgId);
          const existingAtTarget = siblings.filter(t => !movedIds.includes(t.id));

          if (existingAtTarget.length > 0) {
            hasConflict = true;
            if (onConflict === 'merge') {
              const target = existingAtTarget[0];
              const totalAddHours = movedWithSg.reduce((s, i) => s + i.scheduled_hours, 0);
              const totalAddCzk = movedWithSg.reduce((s, i) => s + i.scheduled_czk, 0);
              for (const src of movedWithSg) {
                mergeActions.push({ sourceId: src.id, targetId: target.id, addHours: totalAddHours, addCzk: totalAddCzk });
              }
            } else if (onConflict === 'separate') {
              movedWithSg.forEach(i => separateConflictIds.push(i.id));
            }
          } else {
            movedWithSg.forEach(i => plainMoveIds.push(i.id));
          }
        }
      }

      // If conflict detected and no resolution specified, return signal
      if (hasConflict && !onConflict) {
        return { conflict: true, targetWeek: targetWeekDate, splitGroupIds };
      }

      // Items without split_group_id
      movedItems.filter(i => !i.split_group_id).forEach(i => plainMoveIds.push(i.id));

      // Execute merges
      const mergedSourceIds = new Set<string>();
      const mergedTargets = new Map<string, { addHours: number; addCzk: number }>();
      for (const a of mergeActions) {
        mergedSourceIds.add(a.sourceId);
        if (!mergedTargets.has(a.targetId)) {
          mergedTargets.set(a.targetId, { addHours: a.addHours, addCzk: a.addCzk });
        }
      }

      if (mergedSourceIds.size > 0) {
        await supabase.from("production_schedule").delete().in("id", [...mergedSourceIds]);
        for (const [targetId, add] of mergedTargets) {
          const { data: t } = await supabase.from("production_schedule").select("scheduled_hours, scheduled_czk").eq("id", targetId).single();
          if (t) {
            await supabase.from("production_schedule").update({
              scheduled_hours: t.scheduled_hours + add.addHours,
              scheduled_czk: t.scheduled_czk + add.addCzk,
            }).eq("id", targetId);
          }
        }
        // Renumber remaining split parts
        for (const sgId of splitGroupIds) {
          const { data: remaining } = await supabase.from("production_schedule")
            .select("id, scheduled_week, item_name")
            .or(`split_group_id.eq.${sgId},id.eq.${sgId}`)
            .order("scheduled_week", { ascending: true });
          if (remaining && remaining.length > 1) {
            const cleanName = remaining[0].item_name.replace(/\s*\(\d+\/\d+\)$/, "");
            await Promise.all(remaining.map((s, i) =>
              supabase.from("production_schedule").update({
                item_name: `${cleanName} (${i + 1}/${remaining.length})`,
                split_part: i + 1, split_total: remaining.length,
              }).eq("id", s.id)
            ));
          } else if (remaining && remaining.length === 1) {
            const cleanName = remaining[0].item_name.replace(/\s*\(\d+\/\d+\)$/, "");
            await supabase.from("production_schedule").update({
              item_name: cleanName, split_group_id: null, split_part: null, split_total: null,
            }).eq("id", remaining[0].id);
          }
        }
      }

      // Execute plain moves
      const uniquePlainMoveIds = [...new Set(plainMoveIds)].filter(id => !mergedSourceIds.has(id));
      if (uniquePlainMoveIds.length > 0) {
        const { error } = await supabase
          .from("production_schedule")
          .update({ scheduled_week: targetWeekDate })
          .in("id", uniquePlainMoveIds);
        if (error) throw error;
      }

      // Execute separate-conflict moves — keep original item_code, rely on id + split_group_id.
      const uniqueSeparateIds = [...new Set(separateConflictIds)].filter(id => !mergedSourceIds.has(id));
      if (uniqueSeparateIds.length > 0) {
        const { error } = await supabase
          .from("production_schedule")
          .update({ scheduled_week: targetWeekDate })
          .in("id", uniqueSeparateIds);
        if (error) throw error;
      }

      invalidateAll();

      if (mergedSourceIds.size > 0) {
        toast({ title: `Položky sloučeny do ${weekLabel(targetWeekDate)}` });
      }

      const snapshots = movedItems.map(i => ({ ...i }));
      pushUndo({
        page: "plan-vyroby",
        actionType: "move_bundle",
        description: `Přesun balíku ${projectId} → ${weekLabel(targetWeekDate)}`,
        undo: async () => {
          if (uniquePlainMoveIds.length > 0) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: sourceWeekDate })
              .in("id", uniquePlainMoveIds);
          }
          if (mergedSourceIds.size > 0) {
            for (const [targetId, add] of mergedTargets) {
              const { data: t } = await supabase.from("production_schedule").select("scheduled_hours, scheduled_czk").eq("id", targetId).single();
              if (t) {
                await supabase.from("production_schedule").update({
                  scheduled_hours: t.scheduled_hours - add.addHours,
                  scheduled_czk: t.scheduled_czk - add.addCzk,
                }).eq("id", targetId);
              }
            }
            const { data: { user } } = await supabase.auth.getUser();
            const toReinsert = snapshots.filter(s => mergedSourceIds.has(s.id));
            for (const s of toReinsert) {
              await supabase.from("production_schedule").insert({
                project_id: s.project_id, stage_id: s.stage_id,
                item_name: s.item_name, item_code: s.item_code,
                scheduled_week: s.scheduled_week, scheduled_hours: s.scheduled_hours,
                scheduled_czk: s.scheduled_czk, position: s.position,
                status: s.status, created_by: user?.id,
                split_group_id: s.split_group_id, split_part: s.split_part, split_total: s.split_total,
              });
            }
          }
          // Undo separate-conflict moves: restore original week + item_code
          for (const [itemId, codes] of separateCodeMap) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: sourceWeekDate, item_code: codes.oldCode })
              .eq("id", itemId);
          }
          invalidateAll();
        },
        redo: async () => {
          if (mergedSourceIds.size > 0) {
            await supabase.from("production_schedule").delete().in("id", [...mergedSourceIds]);
            for (const [targetId, add] of mergedTargets) {
              const { data: t } = await supabase.from("production_schedule").select("scheduled_hours, scheduled_czk").eq("id", targetId).single();
              if (t) {
                await supabase.from("production_schedule").update({
                  scheduled_hours: t.scheduled_hours + add.addHours,
                  scheduled_czk: t.scheduled_czk + add.addCzk,
                }).eq("id", targetId);
              }
            }
          }
          if (uniquePlainMoveIds.length > 0) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: targetWeekDate })
              .in("id", uniquePlainMoveIds);
          }
          // Redo separate-conflict moves
          for (const [itemId, codes] of separateCodeMap) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: targetWeekDate, item_code: codes.newCode })
              .eq("id", itemId);
          }
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
            split_group_id: schedItem.split_group_id ?? null,
            split_part: schedItem.split_part ?? null,
            split_total: schedItem.split_total ?? null,
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

      // Keep chain badges consistent across schedule + inbox.
      if (schedItem.split_group_id) {
        try { await renumberChain(schedItem.split_group_id); } catch { /* silent */ }
      }

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
        .update({ status: "expedice", completed_at: new Date().toISOString(), completed_by: user.id })
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

      // Auto-recalc project completion % per unique project
      const affectedProjectIds = new Set((oldItems || []).map((o: any) => o.project_id).filter(Boolean));
      await autoUpdateProjectPercents(affectedProjectIds);

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
          await autoUpdateProjectPercents(affectedProjectIds);
          invalidateAll();
        },
        redo: async () => {
          const { data: { user: u } } = await supabase.auth.getUser();
          await supabase.from("production_schedule")
            .update({ status: "expedice", completed_at: new Date().toISOString(), completed_by: u?.id })
            .in("id", itemIds);
          await autoUpdateProjectPercents(affectedProjectIds);
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
        .update({ status: "scheduled", completed_at: null, completed_by: null, expediced_at: null } as any)
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
          split_group_id: item.split_group_id ?? null,
          split_part: item.split_part ?? null,
          split_total: item.split_total ?? null,
        }));
        const { error: insertErr } = await supabase.from("production_inbox").insert(newItems);
        if (insertErr) throw insertErr;
      }

      // Log activity
      for (const item of items) {
        logActivity({
          projectId: item.project_id,
          actionType: "item_returned_to_inbox",
          oldValue: weekLabel(weekDate),
          newValue: "Inbox",
          detail: JSON.stringify({ item_name: item.item_name, item_code: item.item_code, from_week: weekLabel(weekDate) }),
        });
      }

      // Renumber any chains touched by this return.
      const chainIds = new Set(items.map((i: any) => i.split_group_id).filter(Boolean) as string[]);
      for (const g of chainIds) {
        try { await renumberChain(g); } catch { /* silent */ }
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

  const mergeSplitItems = useCallback(async (
    splitGroupId: string,
    onlyInWeek?: string,
    silent?: boolean,
  ): Promise<{ undo: () => Promise<void>; redo: () => Promise<void>; partsCount: number; description: string } | null> => {
    try {
      const { data: allParts, error: fetchErr } = await supabase
        .from("production_schedule")
        .select("*")
        .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
        .order("split_part", { ascending: true });
      if (fetchErr) throw fetchErr;

      const parts = onlyInWeek
        ? (allParts || []).filter(p => p.scheduled_week === onlyInWeek)
        : (allParts || []);

      if (!parts || parts.length <= 1) {
        if (!silent) toast({ title: "Není co spojit", description: "Nebyla nalezena žádná další část." });
        return null;
      }

      // FIX: Allow cross-week merge — keep earliest week's bundle
      const totalHours = parts.reduce((s, p) => s + p.scheduled_hours, 0);
      const totalCzk = parts.reduce((s, p) => s + p.scheduled_czk, 0);
      // Sort by week to pick earliest as primary
      const sortedParts = [...parts].sort((a, b) => a.scheduled_week.localeCompare(b.scheduled_week));
      const primary = sortedParts[0];
      const remainingParts = (allParts || []).filter(p => !parts.some(mp => mp.id === p.id));
      const cleanName = primary.item_name.replace(/\s*\(\d+\/\d+\)$/, "");
      const hasRemaining = remainingParts.length > 0;
      const otherIds = parts.filter(p => p.id !== primary.id).map(p => p.id);

      // OPTIMIZATION 3: Parallelize delete + update, skip re-fetch for renumbering
      await Promise.all([
        otherIds.length > 0
          ? supabase.from("production_schedule").delete().in("id", otherIds)
          : Promise.resolve(),
        supabase.from("production_schedule").update({
          scheduled_hours: totalHours,
          scheduled_czk: totalCzk,
          item_name: cleanName,
          split_group_id: hasRemaining ? splitGroupId : null,
          split_part: null,
          split_total: null,
        }).eq("id", primary.id),
      ]);

      // OPTIMIZATION 5: Use in-memory data for renumbering instead of re-fetching
      if (hasRemaining) {
        const allRemaining = [primary, ...remainingParts]
          .sort((a, b) => a.scheduled_week.localeCompare(b.scheduled_week));
        if (allRemaining.length > 1) {
          await Promise.all(allRemaining.map((s, i) =>
            supabase.from("production_schedule").update({
              item_name: `${cleanName} (${i + 1}/${allRemaining.length})`,
              split_part: i + 1,
              split_total: allRemaining.length,
            }).eq("id", s.id)
          ));
        } else if (allRemaining.length === 1) {
          await supabase.from("production_schedule").update({
            item_name: cleanName,
            split_group_id: null,
            split_part: null,
            split_total: null,
          }).eq("id", allRemaining[0].id);
        }
      }

      const partsSnapshot = parts.map(p => ({ ...p }));
      const undoFn = async () => {
        const orig = partsSnapshot[0];
        await supabase.from("production_schedule").update({
          scheduled_hours: orig.scheduled_hours, scheduled_czk: orig.scheduled_czk,
          item_name: orig.item_name, split_group_id: orig.split_group_id,
          split_part: orig.split_part, split_total: orig.split_total,
        }).eq("id", orig.id);
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
      };
      const redoFn = async () => {
        await supabase.from("production_schedule").update({
          scheduled_hours: totalHours, scheduled_czk: totalCzk,
          item_name: cleanName, split_group_id: null, split_part: null, split_total: null,
        }).eq("id", primary.id);
        const { data: reParts } = await supabase.from("production_schedule")
          .select("id").or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`)
          .neq("id", primary.id);
        if (reParts && reParts.length) {
          await supabase.from("production_schedule").delete().in("id", reParts.map(p => p.id));
        }
      };

      const result = { undo: undoFn, redo: redoFn, partsCount: parts.length, description: `${parts.length} částí spojeno → "${cleanName}"` };

      if (!silent) {
        pushUndo({
          page: "plan-vyroby",
          actionType: "merge_split",
          description: result.description,
          undo: async () => { await undoFn(); invalidateAll(); },
          redo: async () => { await redoFn(); invalidateAll(); },
        });
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
        qc.invalidateQueries({ queryKey: ["production-inbox"] });
        qc.invalidateQueries({ queryKey: ["production-expedice"] });
      }

      return result;
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      return null;
    }
  }, [invalidateAll, pushUndo, qc]);

  const mergeBundleSplitGroups = useCallback(async (splitGroupIds: string[], onlyInWeek?: string, precedingUndo?: UndoEntry | null) => {
    const results: { undo: () => Promise<void>; redo: () => Promise<void>; partsCount: number; description: string }[] = [];
    for (const sgId of splitGroupIds) {
      const r = await mergeSplitItems(sgId, onlyInWeek, true);
      if (r) results.push(r);
    }
    if (results.length === 0) return;

    const totalParts = results.reduce((s, r) => s + r.partsCount, 0);
    const mergeDesc = `${totalParts} částí spojeno (${results.length} skupin)`;
    pushUndo({
      page: "plan-vyroby",
      actionType: "merge_split",
      description: precedingUndo ? `${mergeDesc} + přesun` : mergeDesc,
      undo: async () => {
        for (const r of results) await r.undo();
        if (precedingUndo) await precedingUndo.undo();
        invalidateAll();
      },
      redo: async () => {
        if (precedingUndo) await precedingUndo.redo();
        for (const r of results) await r.redo();
        invalidateAll();
      },
    });

    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["production-inbox"] });
    qc.invalidateQueries({ queryKey: ["production-expedice"] });
  }, [mergeSplitItems, pushUndo, qc, invalidateAll]);

  /**
   * Bundle-level merge across two weeks: for a project, fold all items in
   * `sourceWeekDate` into `targetWeekDate` as ONE atomic bundle merge.
   * - Items with same item_code present in both weeks → sum hours+czk into target, delete source.
   * - Items only in source → move scheduled_week to target.
   * - All affected rows share/get a single bundleGroupId so the bundle chain
   *   renumbers as one unit (per-week N/M, not per-item).
   */
  const mergeBundleAcrossWeeks = useCallback(async (
    projectId: string,
    sourceWeekDate: string,
    targetWeekDate: string,
  ): Promise<void> => {
    try {
      const [{ data: sourceItems }, { data: targetItems }] = await Promise.all([
        supabase.from("production_schedule").select("*")
          .eq("project_id", projectId).eq("scheduled_week", sourceWeekDate)
          .in("status", ["scheduled", "in_progress"]),
        supabase.from("production_schedule").select("*")
          .eq("project_id", projectId).eq("scheduled_week", targetWeekDate)
          .in("status", ["scheduled", "in_progress"]),
      ]);
      if (!sourceItems || sourceItems.length === 0) return;

      const sourceSnapshot = sourceItems.map(i => ({ ...i }));
      const targetSnapshot = (targetItems || []).map(i => ({ ...i }));

      // Pick a shared bundleGroupId: prefer existing one from either week's chain.
      const existingGid =
        sourceItems.find(i => i.split_group_id)?.split_group_id ||
        (targetItems || []).find(i => i.split_group_id)?.split_group_id ||
        null;
      const bundleGroupId: string = existingGid ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

      // Pair source ↔ target by item_code; null/blank codes use unique fallback so they never pair.
      const targetByCode = new Map<string, any>();
      for (const t of (targetItems || [])) {
        const k = t.item_code ?? `__nocode__${t.id}`;
        if (!targetByCode.has(k)) targetByCode.set(k, t);
      }

      const toDelete: string[] = [];
      const targetUpdates = new Map<string, { hours: number; czk: number }>();
      const toMove: string[] = [];

      for (const src of sourceItems) {
        const k = src.item_code ?? `__nocode__source__${src.id}`;
        const pair = src.item_code ? targetByCode.get(k) : null;
        if (pair) {
          const cur = targetUpdates.get(pair.id) ?? { hours: pair.scheduled_hours, czk: pair.scheduled_czk };
          targetUpdates.set(pair.id, {
            hours: cur.hours + src.scheduled_hours,
            czk: cur.czk + src.scheduled_czk,
          });
          toDelete.push(src.id);
        } else {
          toMove.push(src.id);
        }
      }

      // Apply target merges + deletes + plain moves in parallel.
      const ops: any[] = [];
      for (const [tid, agg] of targetUpdates) {
        ops.push(
          supabase.from("production_schedule").update({
            scheduled_hours: agg.hours,
            scheduled_czk: agg.czk,
            split_group_id: bundleGroupId,
          }).eq("id", tid)
        );
      }
      if (toDelete.length > 0) {
        ops.push(supabase.from("production_schedule").delete().in("id", toDelete));
      }
      if (toMove.length > 0) {
        ops.push(
          supabase.from("production_schedule").update({
            scheduled_week: targetWeekDate,
            split_group_id: bundleGroupId,
          }).in("id", toMove)
        );
      }
      // Ensure ALL remaining target items also share the bundleGroupId (so chain is unified).
      const remainingTargetIds = (targetItems || [])
        .filter(t => !targetUpdates.has(t.id))
        .map(t => t.id);
      if (remainingTargetIds.length > 0) {
        ops.push(
          supabase.from("production_schedule").update({
            split_group_id: bundleGroupId,
          }).in("id", remainingTargetIds)
        );
      }
      await Promise.all(ops);

      // Renumber the whole chain → bundle shrinks by one week.
      await renumberBundleChain(bundleGroupId);

      invalidateAll();
      toast({ title: `Bundle sloučen do ${weekLabel(targetWeekDate)}` });

      pushUndo({
        page: "plan-vyroby",
        actionType: "merge_bundle_across_weeks",
        description: `Sloučení bundle ${projectId} → ${weekLabel(targetWeekDate)}`,
        undo: async () => {
          // Restore target hours/czk
          await Promise.all(
            targetSnapshot.map(t =>
              supabase.from("production_schedule").update({
                scheduled_hours: t.scheduled_hours,
                scheduled_czk: t.scheduled_czk,
                split_group_id: t.split_group_id,
                split_part: t.split_part,
                split_total: t.split_total,
              }).eq("id", t.id)
            )
          );
          // Re-insert deleted source rows
          const { data: { user } } = await supabase.auth.getUser();
          const reins = sourceSnapshot
            .filter(s => toDelete.includes(s.id))
            .map(s => ({
              project_id: s.project_id, stage_id: s.stage_id,
              item_name: s.item_name, item_code: s.item_code,
              scheduled_week: s.scheduled_week, scheduled_hours: s.scheduled_hours,
              scheduled_czk: s.scheduled_czk, position: s.position,
              status: s.status, created_by: user?.id,
              split_group_id: s.split_group_id, split_part: s.split_part, split_total: s.split_total,
            }));
          if (reins.length > 0) {
            await supabase.from("production_schedule").insert(reins);
          }
          // Move plain-moved rows back
          if (toMove.length > 0) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: sourceWeekDate })
              .in("id", toMove);
            // Restore prior split metadata for moved rows
            await Promise.all(
              sourceSnapshot.filter(s => toMove.includes(s.id)).map(s =>
                supabase.from("production_schedule").update({
                  split_group_id: s.split_group_id,
                  split_part: s.split_part,
                  split_total: s.split_total,
                }).eq("id", s.id)
              )
            );
          }
          invalidateAll();
        },
        redo: async () => {
          // Re-apply: simplest = re-run the merge
          await mergeBundleAcrossWeeksRef.current?.(projectId, sourceWeekDate, targetWeekDate);
        },
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [invalidateAll, pushUndo]);

  // Self-reference for redo
  const mergeBundleAcrossWeeksRef = { current: null as null | typeof mergeBundleAcrossWeeks };
  mergeBundleAcrossWeeksRef.current = mergeBundleAcrossWeeks;

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
    mergeBundleSplitGroups,
    mergeBundleAcrossWeeks,
  };
}


