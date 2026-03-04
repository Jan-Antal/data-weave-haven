import { supabase } from "@/integrations/supabase/client";

let lastTrackedUserId: string | null = null;

/**
 * Call once when auth state changes to SIGNED_IN.
 * Prevents duplicate logging by tracking the last user id.
 */
export async function logLoginEvent(userId: string, email: string) {
  if (lastTrackedUserId === userId) return;
  lastTrackedUserId = userId;

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
}
