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
  }: {
    userIds: string[];
    type: string;
    title: string;
    body?: string;
    projectId?: string;
    actorName?: string;
    excludeUserId?: string;
  }
) {
  const filtered = excludeUserId
    ? [...new Set(userIds)].filter((id) => id !== excludeUserId)
    : [...new Set(userIds)];

  if (!filtered.length) return;

  const parts = (actorName || "").trim().split(" ").filter(Boolean);
  const initials =
    parts.length >= 2
      ? parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase()
      : (parts[0]?.[0] || "?").toUpperCase();

  const rows = filtered.map((userId) => ({
    user_id: userId,
    type,
    title,
    body: body || null,
    project_id: projectId || null,
    actor_name: actorName || null,
    actor_initials: initials,
    read: false,
  }));

  await (supabase as any).from("notifications").insert(rows);
}
