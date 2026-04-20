import { supabase } from "@/integrations/supabase/client";

/**
 * Per-item split chain helpers.
 *
 * Definition: a split chain = all rows of a single item_code (within one project)
 * across production_schedule + production_inbox, optionally tied together by a
 * shared split_group_id. split_part / split_total are numbered PER item_code.
 *
 * A bundle split (SplitBundleDialog) splits each item_code in parallel, but
 * each item_code keeps its own independent N/N numbering. So if a bundle of
 * TK.05 + TK.07 + TK.08 is split into 2 parts, every code shows 1/2 and 2/2.
 *
 * Historical midflight rows (production_schedule.is_midflight=true) ARE counted
 * in split_total so the badge reflects all parts of that item_code.
 */

interface ChainRow {
  id: string;
  table: "production_schedule" | "production_inbox";
  item_code: string | null;
  item_name: string;
  scheduled_week: string | null;
  sent_at: string | null;
  status: string;
  is_midflight: boolean;
}

/**
 * Fetch all rows in a split group across schedule + inbox.
 * Includes is_midflight rows (they count toward split_total).
 */
export async function fetchChainRows(splitGroupId: string): Promise<ChainRow[]> {
  const [schedRes, inboxRes] = await Promise.all([
    supabase
      .from("production_schedule")
      .select("id, scheduled_week, status, item_code, item_name, is_midflight")
      .or(`split_group_id.eq.${splitGroupId},id.eq.${splitGroupId}`),
    supabase
      .from("production_inbox")
      .select("id, sent_at, status, item_code, item_name")
      .eq("split_group_id", splitGroupId),
  ]);

  const sched: ChainRow[] = (schedRes.data || [])
    .filter((r: any) => r.status !== "cancelled")
    .map((r: any) => ({
      id: r.id,
      table: "production_schedule" as const,
      item_code: r.item_code ?? null,
      item_name: r.item_name ?? "",
      scheduled_week: r.scheduled_week,
      sent_at: null,
      status: r.status,
      is_midflight: !!r.is_midflight,
    }));

  const inbox: ChainRow[] = (inboxRes.data || [])
    .filter((r: any) => r.status === "pending")
    .map((r: any) => ({
      id: r.id,
      table: "production_inbox" as const,
      item_code: r.item_code ?? null,
      item_name: r.item_name ?? "",
      scheduled_week: null,
      sent_at: r.sent_at,
      status: r.status,
      is_midflight: false,
    }));

  return [...sched, ...inbox];
}

function chainKey(r: ChainRow): string {
  return r.item_code ? `code::${r.item_code}` : `name::${r.item_name}`;
}

function sortChainRows(rows: ChainRow[]): ChainRow[] {
  return [...rows].sort((a, b) => {
    // schedule first, then inbox
    if (a.table !== b.table) return a.table === "production_schedule" ? -1 : 1;
    if (a.table === "production_schedule") {
      return (a.scheduled_week || "").localeCompare(b.scheduled_week || "");
    }
    return (a.sent_at || "").localeCompare(b.sent_at || "");
  });
}

/**
 * Per-item renumber: groups all chain rows by item_code (or item_name fallback)
 * and numbers each group independently as 1..K of K. If a group has only 1 row,
 * its split metadata is cleared (no badge).
 */
export async function renumberChain(splitGroupId: string): Promise<void> {
  const rows = await fetchChainRows(splitGroupId);
  if (rows.length === 0) return;

  // Group by item_code / item_name
  const groups = new Map<string, ChainRow[]>();
  for (const r of rows) {
    const key = chainKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  await Promise.all(
    [...groups.values()].flatMap((groupRows) => {
      const sorted = sortChainRows(groupRows);
      const total = sorted.length;

      if (total === 1) {
        const r = sorted[0];
        return [
          supabase
            .from(r.table)
            .update({ split_part: null, split_total: null })
            .eq("id", r.id),
        ];
      }

      return sorted.map((r, idx) =>
        supabase
          .from(r.table)
          .update({
            split_group_id: splitGroupId,
            split_part: idx + 1,
            split_total: total,
          })
          .eq("id", r.id)
      );
    })
  );
}

/**
 * Project-wide chain renumbering: for every distinct split_group_id present
 * on rows of this project (schedule + inbox), recompute the chain.
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
