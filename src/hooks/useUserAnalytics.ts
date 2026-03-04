import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserAnalytics {
  user_email: string;
  last_login: string | null;
  login_count_30d: number;
  top_page: string | null;
  page_view_count_30d: number;
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

      // Fetch page views (last 30 days)
      const { data: views } = await (supabase.from("data_log") as any)
        .select("user_email, new_value, created_at")
        .eq("action_type", "page_view")
        .gte("created_at", thirtyDaysAgo);

      const loginArr = (logins ?? []) as { user_email: string; created_at: string }[];
      const viewArr = (views ?? []) as { user_email: string; new_value: string; created_at: string }[];

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
            top_page: null,
            page_view_count_30d: 0,
          });
        }
        userMap.get(l.user_email)!.login_count_30d++;
      }

      // Page view counts per user
      const userPageCounts = new Map<string, Map<string, number>>();
      for (const v of viewArr) {
        if (!userMap.has(v.user_email)) {
          userMap.set(v.user_email, {
            user_email: v.user_email,
            last_login: null,
            login_count_30d: 0,
            top_page: null,
            page_view_count_30d: 0,
          });
        }
        userMap.get(v.user_email)!.page_view_count_30d++;

        if (!userPageCounts.has(v.user_email)) userPageCounts.set(v.user_email, new Map());
        const pc = userPageCounts.get(v.user_email)!;
        pc.set(v.new_value, (pc.get(v.new_value) ?? 0) + 1);
      }

      // Determine top page per user
      for (const [email, pages] of userPageCounts) {
        let topPage = "";
        let topCount = 0;
        for (const [page, count] of pages) {
          if (count > topCount) { topPage = page; topCount = count; }
        }
        if (userMap.has(email)) userMap.get(email)!.top_page = topPage;
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
