import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserSession {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  session_start: string;
  last_activity: string;
  session_end: string | null;
}

export interface UserSessionSummary {
  user_email: string;
  user_name: string;
  user_id: string;
  last_activity: string | null;
  total_session_minutes: number;
  session_count: number;
  is_online: boolean;
}

export function formatSessionDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "právě teď";
  if (mins < 60) return `před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `před ${hours}h`;
  const days = Math.floor(hours / 24);
  return `před ${days}d`;
}

const ONLINE_THRESHOLD_MS = 10 * 60_000; // 10 minutes

export function useUserSessions() {
  return useQuery({
    queryKey: ["user-sessions"],
    queryFn: async (): Promise<UserSessionSummary[]> => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch sessions from last 30 days
      const { data: sessions, error } = await (supabase.from("user_sessions") as any)
        .select("*")
        .gte("session_start", thirtyDaysAgo)
        .order("last_activity", { ascending: false });

      if (error) throw error;

      const sessionArr = (sessions ?? []) as UserSession[];

      // Also fetch profiles for full names
      const { data: profilesData } = await supabase.from("profiles").select("id, email, full_name, is_active");
      const profileMap = new Map<string, { full_name: string; user_id: string }>();
      for (const p of (profilesData ?? []) as Array<{ id: string; email: string; full_name: string; is_active: boolean }>) {
        if (p.is_active) profileMap.set(p.email, { full_name: p.full_name, user_id: p.id });
      }

      // Group by user
      const userMap = new Map<string, {
        user_email: string;
        user_name: string;
        user_id: string;
        last_activity: string | null;
        total_minutes: number;
        count: number;
      }>();

      for (const s of sessionArr) {
        const email = s.user_email;
        if (!userMap.has(email)) {
          const profile = profileMap.get(email);
          userMap.set(email, {
            user_email: email,
            user_name: s.user_name || profile?.full_name || email.split("@")[0],
            user_id: s.user_id || profile?.user_id || "",
            last_activity: null,
            total_minutes: 0,
            count: 0,
          });
        }
        const u = userMap.get(email)!;
        u.count++;

        // Compute session duration
        const start = new Date(s.session_start).getTime();
        const end = s.session_end ? new Date(s.session_end).getTime() : new Date(s.last_activity).getTime();
        const durationMin = Math.max(0, Math.round((end - start) / 60_000));
        u.total_minutes += durationMin;

        // Track latest activity
        if (!u.last_activity || s.last_activity > u.last_activity) {
          u.last_activity = s.last_activity;
        }
      }

      // Also add profiles that don't have sessions yet
      for (const [email, profile] of profileMap) {
        if (!userMap.has(email)) {
          userMap.set(email, {
            user_email: email,
            user_name: profile.full_name || email.split("@")[0],
            user_id: profile.user_id,
            last_activity: null,
            total_minutes: 0,
            count: 0,
          });
        }
      }

      const now = Date.now();
      return Array.from(userMap.values())
        .map(u => ({
          user_email: u.user_email,
          user_name: u.user_name,
          user_id: u.user_id,
          last_activity: u.last_activity,
          total_session_minutes: u.total_minutes,
          session_count: u.count,
          is_online: u.last_activity ? (now - new Date(u.last_activity).getTime()) < ONLINE_THRESHOLD_MS : false,
        }))
        .sort((a, b) => {
          // Online first, then by last activity
          if (a.is_online && !b.is_online) return -1;
          if (!a.is_online && b.is_online) return 1;
          const aTime = a.last_activity ?? "";
          const bTime = b.last_activity ?? "";
          if (aTime && !bTime) return -1;
          if (!aTime && bTime) return 1;
          if (aTime && bTime) return bTime.localeCompare(aTime);
          return a.user_name.localeCompare(b.user_name);
        });
    },
    refetchInterval: 60_000, // Refresh every minute
  });
}

// Keep legacy exports for compatibility
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

export function useUserAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: ["user-analytics"],
    queryFn: async (): Promise<AnalyticsSummary> => {
      return { logins_today: 0, active_7d: 0, active_30d: 0, users: [] };
    },
    enabled,
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
        .neq("action_type", "user_login")
        .neq("action_type", "session_end")
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
