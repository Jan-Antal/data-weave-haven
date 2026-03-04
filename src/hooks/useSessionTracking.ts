import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_LOGIN_DETAIL_KEY,
  ACTIVE_LOGIN_LOG_ID_KEY,
  ACTIVE_SESSION_START_KEY,
} from "@/hooks/useLoginTracking";

let sessionStartTime: number | null = null;
let currentUserId: string | null = null;
let currentUserEmail: string | null = null;
let currentAccessToken: string | null = null;
let currentLoginLogId: string | null = null;
let currentLoginDetail: Record<string, unknown> | null = null;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityTime = 0;
let isTrackingActive = false;

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getSessionValue(key: string): string | null {
  if (!canUseSessionStorage()) return null;
  return window.sessionStorage.getItem(key);
}

function removeSessionValue(key: string) {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.removeItem(key);
}

function parseDetail(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hydrateSessionContextFromStorage() {
  currentLoginLogId = getSessionValue(ACTIVE_LOGIN_LOG_ID_KEY);
  const start = getSessionValue(ACTIVE_SESSION_START_KEY);
  sessionStartTime = start ? Number(start) || null : null;
  currentLoginDetail = parseDetail(getSessionValue(ACTIVE_LOGIN_DETAIL_KEY));
}

function computeDurationMinutes(endTimeMs: number) {
  if (!sessionStartTime) return 0;
  return Math.max(0, Math.round((endTimeMs - sessionStartTime) / 60_000));
}

function buildPatchedDetail(durationMin: number, reason: "inactivity" | "sign_out" | "beforeunload", endIso: string) {
  return JSON.stringify({
    ...(currentLoginDetail ?? {}),
    session_duration_minutes: durationMin,
    session_start: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
    session_end: endIso,
    session_end_reason: reason,
  });
}

function startInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    void endSessionDueToInactivity();
  }, INACTIVITY_TIMEOUT_MS);
}

function onUserActivity() {
  lastActivityTime = Date.now();
  startInactivityTimer();
}

/**
 * Start tracking an active user session tied to the existing user_login row.
 */
export function startSession(userId: string, email: string, accessToken?: string) {
  currentUserId = userId;
  currentUserEmail = email;
  currentAccessToken = accessToken ?? null;

  if (!currentLoginLogId || !sessionStartTime) {
    hydrateSessionContextFromStorage();
  }

  if (!currentLoginLogId || !sessionStartTime || isTrackingActive) {
    return;
  }

  isTrackingActive = true;
  lastActivityTime = Date.now();

  window.addEventListener("mousemove", onUserActivity);
  window.addEventListener("keydown", onUserActivity);
  window.addEventListener("click", onUserActivity);
  window.addEventListener("scroll", onUserActivity);
  window.addEventListener("beforeunload", endSessionSync);

  startInactivityTimer();
}

async function patchSessionDuration(durationMin: number, reason: "inactivity" | "sign_out") {
  if (!currentUserId || !currentLoginLogId) return;

  const endIso = new Date().toISOString();
  const detail = buildPatchedDetail(durationMin, reason, endIso);

  try {
    await (supabase.from("data_log") as any)
      .update({ detail })
      .eq("id", currentLoginLogId)
      .eq("user_id", currentUserId)
      .eq("action_type", "user_login");
  } catch (e) {
    console.error("Session update tracking error:", e);
  }
}

async function endSessionDueToInactivity() {
  if (!sessionStartTime || !currentLoginLogId) return;

  const endTime = lastActivityTime || Date.now();
  const durationMin = computeDurationMinutes(endTime);
  await patchSessionDuration(durationMin, "inactivity");
  cleanup();
}

/**
 * Called on explicit sign-out — patches user_login detail with session duration.
 */
export async function endSession() {
  if (!sessionStartTime || !currentLoginLogId) {
    cleanup();
    return;
  }

  const durationMin = computeDurationMinutes(Date.now());
  await patchSessionDuration(durationMin, "sign_out");
  cleanup();
}

function endSessionSync() {
  if (!sessionStartTime || !currentUserId || !currentLoginLogId) return;

  const endTime = Date.now();
  const durationMin = computeDurationMinutes(endTime);
  const detail = buildPatchedDetail(durationMin, "beforeunload", new Date(endTime).toISOString());

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!baseUrl || !publishableKey || !currentAccessToken) {
    cleanup();
    return;
  }

  const query =
    `id=eq.${encodeURIComponent(currentLoginLogId)}` +
    `&user_id=eq.${encodeURIComponent(currentUserId)}` +
    `&action_type=eq.user_login`;

  const url = `${baseUrl}/rest/v1/data_log?${query}`;

  const headers = {
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${currentAccessToken}`,
    Prefer: "return=minimal",
  };

  try {
    fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ detail }),
      keepalive: true,
    });
  } catch {
    // ignore best-effort unload errors
  }

  cleanup();
}

function cleanup() {
  if (inactivityTimer) clearTimeout(inactivityTimer);

  window.removeEventListener("mousemove", onUserActivity);
  window.removeEventListener("keydown", onUserActivity);
  window.removeEventListener("click", onUserActivity);
  window.removeEventListener("scroll", onUserActivity);
  window.removeEventListener("beforeunload", endSessionSync);

  removeSessionValue(ACTIVE_LOGIN_LOG_ID_KEY);
  removeSessionValue(ACTIVE_SESSION_START_KEY);
  removeSessionValue(ACTIVE_LOGIN_DETAIL_KEY);

  sessionStartTime = null;
  currentUserId = null;
  currentUserEmail = null;
  currentAccessToken = null;
  currentLoginLogId = null;
  currentLoginDetail = null;
  inactivityTimer = null;
  lastActivityTime = 0;
  isTrackingActive = false;
}

export function resetSessionTracking() {
  cleanup();
}
