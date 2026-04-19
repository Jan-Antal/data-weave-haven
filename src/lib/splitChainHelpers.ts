import { supabase } from "@/integrations/supabase/client";

/**
 * Project-wide bundle split chain helpers.
 *
 * A bundle = all production_schedule + production_inbox rows belonging to the
 * same project that share a single split_group_id. Items from different
 * item_codes can belong to the same chain. Renumbering recomputes
 * split_part/split_total across BOTH tables so badges stay consistent
 * after splits, drag-drop, midflight import, and recalculate.
 */

interface ChainRow {
  id: string;
  table: "production_schedule" | "production_inbox";
  scheduled_week: string | null;
  sent_at: string | null;
  status: string;
}

/**
 * Fetch all rows in a split group across schedule + inbox.
 * Returns rows sorted by:
 *   1) schedule rows first (by scheduled_week ASC)
 *   2) inbox rows after (by sent_at ASC)
 */
export async function fetchChainRows(splitGroupId: string): Promise<ChainRow[]> {
  const [schedRes, inboxRes] = await Promise.all([
    supabase
      .from("production_schedule")
      .select("id, scheduled_week, status")
      .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`),
    supabase
      .from("production_inbox")
      .select("id, sent_at, status")
      .eq("split_group_id", splitGroupId),
  ]);

  const sched: ChainRow[] = (schedRes.data || [])
    .filter((r: any) => r.status !== "cancelled")
    .map((r: any) => ({
      id: r.id,
      table: "production_schedule" as const,
      scheduled_week: r.scheduled_week,
      sent_at: null,
      status: r.status,
    }))
    .sort((a, b) => (a.scheduled_week || "").localeCompare(b.scheduled_week || ""));

  const inbox: ChainRow[] = (inboxRes.data || [])
    .filter((r: any) => r.status === "pending")
    .map((r: any) => ({
      id: r.id,
      table: "production_inbox" as const,
      scheduled_week: null,
      sent_at: r.sent_at,
      status: r.status,
    }))
    .sort((a, b) => (a.sent_at || "").localeCompare(b.sent_at || ""));

  return [...sched, ...inbox];
}

/**
 * Recompute split_part / split_total for every row in a chain.
 * If only one row remains, clears split metadata entirely.
 */
export async function renumberChain(splitGroupId: string): Promise<void> {
  const rows = await fetchChainRows(splitGroupId);
  if (rows.length === 0) return;

  if (rows.length === 1) {
    const r = rows[0];
    await supabase
      .from(r.table)
      .update({ split_group_id: null, split_part: null, split_total: null })
      .eq("id", r.id);
    return;
  }

  const total = rows.length;
  await Promise.all(
    rows.map((r, idx) =>
      supabase
        .from(r.table)
        .update({
          split_group_id: splitGroupId,
          split_part: idx + 1,
          split_total: total,
        })
        .eq("id", r.id)
    )
  );
}

/**
 * Project-wide chain renumbering: for every distinct split_group_id present
 * on rows of this project (schedule + inbox), recompute the chain.
 * Useful after midflight import or recalculate to make badges consistent.
 */
export async function renumberAllChainsForProject(projectId: string): Promise<void> {
  const [schedRes, inboxRes] = await Promise.all([
    supabase
      .from("production_schedule")
      .select("split_group_id")
      .eq("project_id", projectId)
      .not("split_group_id", "is", null),
    supabase
      .from("production_inbox")
      .select("split_group_id")
      .eq("project_id", projectId)
      .not("split_group_id", "is", null),
  ]);

  const groupIds = new Set<string>();
  for (const r of (schedRes.data || []) as any[]) if (r.split_group_id) groupIds.add(r.split_group_id);
  for (const r of (inboxRes.data || []) as any[]) if (r.split_group_id) groupIds.add(r.split_group_id);

  for (const g of groupIds) {
    await renumberChain(g);
  }
}
