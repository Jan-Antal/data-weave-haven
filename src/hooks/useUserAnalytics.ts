import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserAnalytics {
  user_email: string;
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

export function useUserAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: ["user-analytics"],
    queryFn: async (): Promise<AnalyticsSummary> => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch ALL data_log entries from last 30 days
      const { data: allEntries } = await (supabase.from("data_log") as any)
        .select("user_email, created_at, action_type, detail")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false });

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

      const userMap = new Map<string, UserAnalytics>();
      const sessionMinsByUser = new Map<string, number[]>();

      for (const entry of entryArr) {
        if (!entry.user_email) continue;

        // Skip user_session entries from action counts (they're internal tracking)
        const isSessionEntry = entry.action_type === "user_session";

        if (!userMap.has(entry.user_email)) {
          userMap.set(entry.user_email, {
            user_email: entry.user_email,
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
          // Track last real activity (not heartbeats)
          if (!u.last_activity) u.last_activity = entry.created_at;
        }

        if (entry.action_type === "user_login") {
          u.login_count_30d += 1;
          if (!u.last_login) u.last_login = entry.created_at;
        }

        // Extract session duration from user_session entries (heartbeat-based)
        if (isSessionEntry && entry.detail) {
          try {
            const parsed = JSON.parse(entry.detail) as { duration_minutes?: unknown };
            const minutesRaw = parsed.duration_minutes;
            const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
            if (Number.isFinite(minutes) && minutes > 0) {
              if (!sessionMinsByUser.has(entry.user_email)) {
                sessionMinsByUser.set(entry.user_email, []);
              }
              sessionMinsByUser.get(entry.user_email)!.push(Math.round(minutes));
            }
          } catch {
            // ignore
          }
        }

        // Fallback: also read from old user_login session_duration_minutes
        if (entry.action_type === "user_login" && entry.detail) {
          try {
            const parsed = JSON.parse(entry.detail) as { session_duration_minutes?: unknown };
            const minutesRaw = parsed.session_duration_minutes;
            const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
            if (Number.isFinite(minutes) && minutes > 0) {
              if (!sessionMinsByUser.has(entry.user_email)) {
                sessionMinsByUser.set(entry.user_email, []);
              }
              sessionMinsByUser.get(entry.user_email)!.push(Math.round(minutes));
            }
          } catch {
            // ignore
          }
        }
      }

      for (const [email, mins] of sessionMinsByUser) {
        const u = userMap.get(email);
        if (!u) continue;
        const total = mins.reduce((acc, v) => acc + v, 0);
        u.total_session_min = total;
        u.avg_session_min = mins.length > 0 ? Math.round(total / mins.length) : 0;
      }

      return {
        logins_today: loginsToday,
        active_7d: uniqueUsers7d.size,
        active_30d: uniqueUsers30d.size,
        users: Array.from(userMap.values()).sort((a, b) => {
          const aTime = a.last_activity ?? "";
          const bTime = b.last_activity ?? "";
          return bTime.localeCompare(aTime);
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
