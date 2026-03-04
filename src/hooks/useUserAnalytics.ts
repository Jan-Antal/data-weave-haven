import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserAnalytics {
  user_email: string;
  last_login: string | null;
  login_count_30d: number;
  avg_session_min: number;
  total_session_min: number;
}

export interface AnalyticsSummary {
  logins_today: number;
  active_7d: number;
  active_30d: number;
  users: UserAnalytics[];
}

export function useUserAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: ["user-analytics"],
    queryFn: async (): Promise<AnalyticsSummary> => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch login entries (last 30 days)
      const { data: logins } = await (supabase.from("data_log") as any)
        .select("user_email, created_at")
        .eq("action_type", "user_login")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false });

      // Fetch session_end entries (last 30 days) for duration
      const { data: sessions } = await (supabase.from("data_log") as any)
        .select("user_email, detail")
        .eq("action_type", "session_end")
        .gte("created_at", thirtyDaysAgo);

      const loginArr = (logins ?? []) as { user_email: string; created_at: string }[];
      const sessionArr = (sessions ?? []) as { user_email: string; detail: string | null }[];

      // Summary counts
      const loginsToday = loginArr.filter(l => new Date(l.created_at) >= todayStart).length;
      const uniqueUsers7d = new Set(loginArr.filter(l => l.created_at >= sevenDaysAgo).map(l => l.user_email));
      const uniqueUsers30d = new Set(loginArr.map(l => l.user_email));

      // Per-user breakdown
      const userMap = new Map<string, UserAnalytics>();

      for (const l of loginArr) {
        if (!userMap.has(l.user_email)) {
          userMap.set(l.user_email, {
            user_email: l.user_email,
            last_login: l.created_at,
            login_count_30d: 0,
            avg_session_min: 0,
            total_session_min: 0,
          });
        }
        userMap.get(l.user_email)!.login_count_30d++;
      }

      // Session durations per user
      const userSessionMins = new Map<string, number[]>();
      for (const s of sessionArr) {
        if (!s.detail) continue;
        try {
          const parsed = JSON.parse(s.detail);
          const mins = parsed.duration_minutes ?? 0;
          if (!userSessionMins.has(s.user_email)) userSessionMins.set(s.user_email, []);
          userSessionMins.get(s.user_email)!.push(mins);
        } catch {}
      }

      for (const [email, mins] of userSessionMins) {
        if (!userMap.has(email)) {
          userMap.set(email, {
            user_email: email,
            last_login: null,
            login_count_30d: 0,
            avg_session_min: 0,
            total_session_min: 0,
          });
        }
        const total = mins.reduce((a, b) => a + b, 0);
        const avg = mins.length > 0 ? Math.round(total / mins.length) : 0;
        userMap.get(email)!.total_session_min = total;
        userMap.get(email)!.avg_session_min = avg;
      }

      return {
        logins_today: loginsToday,
        active_7d: uniqueUsers7d.size,
        active_30d: uniqueUsers30d.size,
        users: Array.from(userMap.values()).sort((a, b) => {
          const aTime = a.last_login ?? "";
          const bTime = b.last_login ?? "";
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
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{
        id: string;
        action_type: string;
        project_id: string;
        new_value: string | null;
        detail: string | null;
        created_at: string;
      }>;
    },
    enabled: enabled && !!userEmail,
  });
}
