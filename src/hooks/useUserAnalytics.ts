import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserAnalytics {
  user_email: string;
  full_name: string | null;
  role: string | null;
  last_login: string | null;
  last_activity: string | null;
  login_count_30d: number;
  total_actions_30d: number;
  avg_session_min: number;
  total_session_min: number;
}

export interface AnalyticsSummary {
  logins_today: number;
  active_7d: number;
  active_30d: number;
  users: UserAnalytics[];
}

export function formatSessionDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

/**
 * Fallback: estimate session durations from action timestamps when no heartbeat data exists.
 */
function estimateSessionsFromActions(
  entries: Array<{ user_email: string; created_at: string; action_type: string }>,
): Map<string, number[]> {
  const dayMap = new Map<string, number[]>();

  for (const e of entries) {
    if (!e.user_email || e.action_type === "user_session") continue;
    const day = e.created_at.slice(0, 10);
    const key = `${e.user_email}|${day}`;
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(new Date(e.created_at).getTime());
  }

  const result = new Map<string, number[]>();
  for (const [key, timestamps] of dayMap) {
    const email = key.split("|")[0];
    if (timestamps.length < 2) continue;
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    const durationMin = Math.round((max - min) / 60_000);
    if (durationMin < 1) continue;
    if (!result.has(email)) result.set(email, []);
    result.get(email)!.push(durationMin);
  }

  return result;
}

export function useUserAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: ["user-analytics"],
    queryFn: async (): Promise<AnalyticsSummary> => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch all profiles + roles first (source of truth for user list)
      const [{ data: profilesData }, { data: rolesData }, { data: allEntries }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, is_active"),
        supabase.from("user_roles").select("user_id, role"),
        (supabase.from("data_log") as any)
          .select("user_email, created_at, action_type, detail")
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: false }),
      ]);

      // Build role lookup
      const roleMap = new Map<string, string>();
      for (const r of (rolesData ?? []) as Array<{ user_id: string; role: string }>) {
        roleMap.set(r.user_id, r.role);
      }

      // Build initial userMap from profiles — every registered user appears
      const userMap = new Map<string, UserAnalytics>();
      for (const p of (profilesData ?? []) as Array<{ id: string; email: string; full_name: string; is_active: boolean }>) {
        if (!p.is_active) continue;
        userMap.set(p.email, {
          user_email: p.email,
          full_name: p.full_name || null,
          role: roleMap.get(p.id) ?? null,
          last_login: null,
          last_activity: null,
          login_count_30d: 0,
          total_actions_30d: 0,
          avg_session_min: 0,
          total_session_min: 0,
        });
      }

      const entryArr = (allEntries ?? []) as Array<{
        user_email: string;
        created_at: string;
        action_type: string;
        detail: string | null;
      }>;

      const loginsToday = entryArr.filter(
        (e) => e.action_type === "user_login" && new Date(e.created_at) >= todayStart
      ).length;

      const uniqueUsers7d = new Set(
        entryArr.filter((e) => e.created_at >= sevenDaysAgo).map((e) => e.user_email)
      );
      const uniqueUsers30d = new Set(entryArr.map((e) => e.user_email));

      const heartbeatMinsByUser = new Map<string, number[]>();

      for (const entry of entryArr) {
        if (!entry.user_email) continue;
        const isSessionEntry = entry.action_type === "user_session";

        // Ensure user exists in map (handles data_log entries for users not in profiles)
        if (!userMap.has(entry.user_email)) {
          userMap.set(entry.user_email, {
            user_email: entry.user_email,
            full_name: null,
            role: null,
            last_login: null,
            last_activity: null,
            login_count_30d: 0,
            total_actions_30d: 0,
            avg_session_min: 0,
            total_session_min: 0,
          });
        }

        const u = userMap.get(entry.user_email)!;

        if (!isSessionEntry) {
          u.total_actions_30d += 1;
          if (!u.last_activity) u.last_activity = entry.created_at;
        }

        if (entry.action_type === "user_login") {
          u.login_count_30d += 1;
          if (!u.last_login) u.last_login = entry.created_at;
        }

        // Extract duration from heartbeat user_session records
        if (isSessionEntry && entry.detail) {
          try {
            const parsed = JSON.parse(entry.detail) as { duration_minutes?: unknown };
            const minutesRaw = parsed.duration_minutes;
            const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
            if (Number.isFinite(minutes) && minutes > 0) {
              if (!heartbeatMinsByUser.has(entry.user_email)) {
                heartbeatMinsByUser.set(entry.user_email, []);
              }
              heartbeatMinsByUser.get(entry.user_email)!.push(Math.round(minutes));
            }
          } catch {}
        }

        // Legacy: session_duration_minutes in user_login detail
        if (entry.action_type === "user_login" && entry.detail) {
          try {
            const parsed = JSON.parse(entry.detail) as { session_duration_minutes?: unknown };
            const minutesRaw = parsed.session_duration_minutes;
            const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
            if (Number.isFinite(minutes) && minutes > 0) {
              if (!heartbeatMinsByUser.has(entry.user_email)) {
                heartbeatMinsByUser.set(entry.user_email, []);
              }
              heartbeatMinsByUser.get(entry.user_email)!.push(Math.round(minutes));
            }
          } catch {}
        }
      }

      // Fallback: estimate sessions from action timestamps
      const estimatedSessions = estimateSessionsFromActions(entryArr);

      for (const [email, u] of userMap) {
        const heartbeatMins = heartbeatMinsByUser.get(email);
        if (heartbeatMins && heartbeatMins.length > 0) {
          const total = heartbeatMins.reduce((acc, v) => acc + v, 0);
          u.total_session_min = total;
          u.avg_session_min = Math.round(total / heartbeatMins.length);
        } else {
          const estimated = estimatedSessions.get(email);
          if (estimated && estimated.length > 0) {
            const total = estimated.reduce((acc, v) => acc + v, 0);
            u.total_session_min = total;
            u.avg_session_min = Math.round(total / estimated.length);
          }
        }
      }

      return {
        logins_today: loginsToday,
        active_7d: uniqueUsers7d.size,
        active_30d: uniqueUsers30d.size,
        users: Array.from(userMap.values()).sort((a, b) => {
          // Users with recent activity first, then alphabetically
          const aTime = a.last_activity ?? "";
          const bTime = b.last_activity ?? "";
          if (aTime && !bTime) return -1;
          if (!aTime && bTime) return 1;
          if (aTime && bTime) return bTime.localeCompare(aTime);
          return (a.full_name ?? a.user_email).localeCompare(b.full_name ?? b.user_email);
        }),
      };
    },
    enabled,
    refetchInterval: 60_000,
  });
}

export function useUserRecentActions(userEmail: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["user-recent-actions", userEmail],
    queryFn: async () => {
      if (!userEmail) return [];
      const { data } = await (supabase.from("data_log") as any)
        .select("*")
        .eq("user_email", userEmail)
        .neq("action_type", "page_view")
        .neq("action_type", "user_session")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{
        id: string;
        action_type: string;
        project_id: string;
        new_value: string | null;
        old_value: string | null;
        detail: string | null;
        created_at: string;
      }>;
    },
    enabled: enabled && !!userEmail,
  });
}
