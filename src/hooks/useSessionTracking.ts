import { supabase } from "@/integrations/supabase/client";

let sessionStartTime: number | null = null;
let currentUserId: string | null = null;
let currentUserEmail: string | null = null;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityTime: number = 0;

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Called on actual sign-in — starts tracking session duration.
 */
export function startSession(userId: string, email: string) {
  sessionStartTime = Date.now();
  currentUserId = userId;
  currentUserEmail = email;
  lastActivityTime = Date.now();

  // Listen for user activity to reset inactivity timer
  window.addEventListener("mousemove", onUserActivity);
  window.addEventListener("keydown", onUserActivity);
  window.addEventListener("click", onUserActivity);
  window.addEventListener("scroll", onUserActivity);
  window.addEventListener("beforeunload", endSessionSync);

  startInactivityTimer();
}

function onUserActivity() {
  lastActivityTime = Date.now();
  // Reset inactivity timer
  startInactivityTimer();
}

function startInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    // User has been inactive for 15 minutes — end session
    endSessionDueToInactivity();
  }, INACTIVITY_TIMEOUT_MS);
}

async function endSessionDueToInactivity() {
  if (!sessionStartTime || !currentUserId) return;

  // Use lastActivityTime as the actual session end time
  const durationMs = lastActivityTime - sessionStartTime;
  const durationMin = Math.max(1, Math.round(durationMs / 60_000));

  await logSessionEnd(durationMin);
  
  // Reset start time to now — if user comes back, new session starts from activity
  sessionStartTime = Date.now();
}

/**
 * Called on explicit sign-out — logs session_end with duration.
 */
export async function endSession() {
  if (!sessionStartTime || !currentUserId) return;

  const durationMs = Date.now() - sessionStartTime;
  const durationMin = Math.max(0, Math.round(durationMs / 60_000));

  await logSessionEnd(durationMin);
  cleanup();
}

async function logSessionEnd(durationMin: number) {
  if (!currentUserId) return;

  try {
    await (supabase.from("data_log") as any).insert({
      project_id: "_system_",
      user_id: currentUserId,
      user_email: currentUserEmail ?? "",
      action_type: "session_end",
      old_value: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
      new_value: new Date().toISOString(),
      detail: JSON.stringify({
        duration_minutes: durationMin,
        session_start: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
      }),
    });
  } catch (e) {
    console.error("Session end tracking error:", e);
  }
}

function endSessionSync() {
  if (!sessionStartTime || !currentUserId) return;

  const durationMs = Date.now() - sessionStartTime;
  const durationMin = Math.max(0, Math.round(durationMs / 60_000));

  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/data_log`;
  const body = JSON.stringify({
    project_id: "_system_",
    user_id: currentUserId,
    user_email: currentUserEmail ?? "",
    action_type: "session_end",
    old_value: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
    new_value: new Date().toISOString(),
    detail: JSON.stringify({
      duration_minutes: durationMin,
      session_start: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
    }),
  });

  const headers = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  try {
    fetch(url, { method: "POST", headers, body, keepalive: true });
  } catch {}

  cleanup();
}

function cleanup() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  window.removeEventListener("mousemove", onUserActivity);
  window.removeEventListener("keydown", onUserActivity);
  window.removeEventListener("click", onUserActivity);
  window.removeEventListener("scroll", onUserActivity);
  window.removeEventListener("beforeunload", endSessionSync);
  sessionStartTime = null;
  currentUserId = null;
  currentUserEmail = null;
  inactivityTimer = null;
}

export function resetSessionTracking() {
  cleanup();
}
