/**
 * Read-only API for tpv_items (entity owned by Project Info module).
 * TPV tabs use this to display references to project items but never
 * mutate them. Edits live in Project Info.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TpvItemRef } from "../types";

const SELECT =
  "id, project_id, item_code, nazev, popis, status, pocet, cena, konstrukter, stage_id";

/** Single item by id. */
export async function fetchTpvItem(id: string): Promise<TpvItemRef | null> {
  const { data, error } = await supabase
    .from("tpv_items")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TpvItemRef | null;
}

/** All items for a project, ordered by item_code. */
export async function fetchTpvItemsForProject(
  projectId: string
): Promise<TpvItemRef[]> {
  const { data, error } = await supabase
    .from("tpv_items")
    .select(SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("item_code");
  if (error) throw error;
  return (data ?? []) as TpvItemRef[];
}

/** Bulk fetch by ids (for hydrating subcontract/material/hours rows). */
export async function fetchTpvItemsByIds(
  ids: string[]
): Promise<TpvItemRef[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("tpv_items")
    .select(SELECT)
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as TpvItemRef[];
}
