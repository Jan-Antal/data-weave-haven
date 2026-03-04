import { supabase } from "@/integrations/supabase/client";

let lastTrackedUserId: string | null = null;
let lastLoginTime: number = 0;

const LOGIN_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Log a login event, but only if:
 * 1. It's a different user than last tracked, OR
 * 2. More than 30 minutes have passed since last login log
 */
export async function logLoginEvent(userId: string, email: string) {
  const now = Date.now();

  // Same user within dedup window → skip
  if (lastTrackedUserId === userId && (now - lastLoginTime) < LOGIN_DEDUP_WINDOW_MS) {
    return;
  }

  // Also check DB for recent login to handle page reloads
  try {
    const thirtyMinAgo = new Date(now - LOGIN_DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await (supabase.from("data_log") as any)
      .select("id")
      .eq("action_type", "user_login")
      .eq("user_id", userId)
      .gte("created_at", thirtyMinAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      // Already logged recently — just update memory state
      lastTrackedUserId = userId;
      lastLoginTime = now;
      return;
    }
  } catch {}

  lastTrackedUserId = userId;
  lastLoginTime = now;

  try {
    await (supabase.from("data_log") as any).insert({
      project_id: "_system_",
      user_id: userId,
      user_email: email,
      action_type: "user_login",
      old_value: null,
      new_value: null,
      detail: JSON.stringify({
        email,
        login_method: "password",
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Login tracking error:", e);
  }
}

export function resetLoginTracking() {
  lastTrackedUserId = null;
  lastLoginTime = 0;
}
