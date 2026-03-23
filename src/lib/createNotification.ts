import type { SupabaseClient } from "@supabase/supabase-js";

export async function getUserIdsByRole(
  supabase: SupabaseClient,
  roles: string[]
): Promise<string[]> {
  const { data } = await (supabase as any)
    .from("user_roles")
    .select("user_id")
    .in("role", roles);
  return (data || []).map((r: any) => r.user_id as string);
}

/** Resolve a person name (from people table) to their user_id via profiles.person_id */
export async function resolvePersonToUserId(
  supabase: SupabaseClient,
  personName: string
): Promise<string | null> {
  if (!personName) return null;
  const { data: people } = await (supabase as any)
    .from("people")
    .select("id")
    .eq("name", personName)
    .limit(1);
  if (!people?.length) return null;
  const personId = people[0].id;
  const { data: prof } = await (supabase as any)
    .from("profiles")
    .select("id")
    .eq("person_id", personId)
    .limit(1);
  return prof?.[0]?.id || null;
}

function getInitials(name: string): string {
  const parts = (name || "").trim().split(" ").filter(Boolean);
  return parts.length >= 2
    ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

export async function createNotification(
  supabase: SupabaseClient,
  {
    userIds,
    type,
    title,
    body,
    projectId,
    actorName,
    excludeUserId,
    linkContext,
    batchKey,
  }: {
    userIds: string[];
    type: string;
    title: string;
    body?: string;
    projectId?: string;
    actorName?: string;
    excludeUserId?: string;
    linkContext?: { tab?: string; project_id?: string; item_id?: string; field?: string };
    batchKey?: string;
  }
) {
  const filtered = excludeUserId
    ? [...new Set(userIds)].filter((id) => id !== excludeUserId)
    : [...new Set(userIds)];

  if (!filtered.length) return;

  const initials = getInitials(actorName || "");

  const rows = filtered.map((userId) => ({
    user_id: userId,
    type,
    title,
    body: body || null,
    project_id: projectId || null,
    actor_name: actorName || null,
    actor_initials: initials,
    read: false,
    link_context: linkContext || null,
    batch_key: batchKey || null,
  }));

  await (supabase as any).from("notifications").insert(rows);
}

/**
 * Creates or updates a batched notification within a time window.
 * Prevents notification spam when multiple items are changed one by one.
 * titleTemplate should contain {count} placeholder, e.g. "Pridaných {count} položiek na {projectId}"
 */
export async function createOrUpdateBatchNotification(
  supabase: SupabaseClient,
  {
    userIds,
    type,
    titleTemplate,
    body,
    projectId,
    actorName,
    excludeUserId,
    linkContext,
    batchKey,
    batchWindowMinutes = 5,
  }: {
    userIds: string[];
    type: string;
    titleTemplate: string;
    body?: string;
    projectId?: string;
    actorName?: string;
    excludeUserId?: string;
    linkContext?: { tab?: string; project_id?: string; item_id?: string };
    batchKey: string;
    batchWindowMinutes?: number;
  }
) {
  const filtered = excludeUserId
    ? [...new Set(userIds)].filter((id) => id !== excludeUserId)
    : [...new Set(userIds)];

  if (!filtered.length) return;

  const initials = getInitials(actorName || "");
  const windowStart = new Date(Date.now() - batchWindowMinutes * 60_000).toISOString();

  for (const userId of filtered) {
    // Check for existing notification within window
    const { data: existing } = await (supabase as any)
      .from("notifications")
      .select("id, title")
      .eq("user_id", userId)
      .eq("batch_key", batchKey)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing?.length) {
      // Extract current count from title, increment
      const currentCount = extractCount(existing[0].title) || 1;
      const newCount = currentCount + 1;
      const newTitle = titleTemplate.replace("{count}", String(newCount));

      await (supabase as any)
        .from("notifications")
        .update({
          title: newTitle,
          body: body || null,
          read: false,
          created_at: new Date().toISOString(),
          link_context: linkContext || null,
        })
        .eq("id", existing[0].id);
    } else {
      // Insert new with count=1
      const title = titleTemplate.replace("{count}", "1");
      await (supabase as any).from("notifications").insert({
        user_id: userId,
        type,
        title,
        body: body || null,
        project_id: projectId || null,
        actor_name: actorName || null,
        actor_initials: initials,
        read: false,
        link_context: linkContext || null,
        batch_key: batchKey,
      });
    }
  }
}

function extractCount(title: string): number | null {
  // Look for numbers in the title
  const match = title.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
