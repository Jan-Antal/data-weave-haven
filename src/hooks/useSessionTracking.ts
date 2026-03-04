import { supabase } from "@/integrations/supabase/client";

let sessionStartTime: string | null = null;
let currentUserId: string | null = null;
let currentUserEmail: string | null = null;

/**
 * Called on SIGNED_IN – records session start timestamp.
 */
export function startSession(userId: string, email: string) {
  sessionStartTime = new Date().toISOString();
  currentUserId = userId;
  currentUserEmail = email;

  // Track session end on page close / tab close
  window.addEventListener("beforeunload", endSessionSync);
}

/**
 * Called on sign-out or page unload – logs session_end with duration.
 */
export async function endSession() {
  if (!sessionStartTime || !currentUserId) return;

  const durationMs = Date.now() - new Date(sessionStartTime).getTime();
  const durationMin = Math.round(durationMs / 60_000);

  try {
    await (supabase.from("data_log") as any).insert({
      project_id: "_system_",
      user_id: currentUserId,
      user_email: currentUserEmail ?? "",
      action_type: "session_end",
      old_value: sessionStartTime,
      new_value: new Date().toISOString(),
      detail: JSON.stringify({
        duration_minutes: durationMin,
        session_start: sessionStartTime,
      }),
    });
  } catch (e) {
    console.error("Session end tracking error:", e);
  }

  cleanup();
}

function endSessionSync() {
  if (!sessionStartTime || !currentUserId) return;

  const durationMs = Date.now() - new Date(sessionStartTime).getTime();
  const durationMin = Math.round(durationMs / 60_000);

  // Use sendBeacon for reliability on page unload
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/data_log`;
  const body = JSON.stringify({
    project_id: "_system_",
    user_id: currentUserId,
    user_email: currentUserEmail ?? "",
    action_type: "session_end",
    old_value: sessionStartTime,
    new_value: new Date().toISOString(),
    detail: JSON.stringify({
      duration_minutes: durationMin,
      session_start: sessionStartTime,
    }),
  });

  navigator.sendBeacon(
    url,
    new Blob([body], { type: "application/json" })
  );

  cleanup();
}

function cleanup() {
  window.removeEventListener("beforeunload", endSessionSync);
  sessionStartTime = null;
  currentUserId = null;
  currentUserEmail = null;
}

export function resetSessionTracking() {
  cleanup();
}
