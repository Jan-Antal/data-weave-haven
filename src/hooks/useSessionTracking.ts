import { supabase } from "@/integrations/supabase/client";

// ── Constants ──────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 60_000;        // 1 minute
const IDLE_TIMEOUT_MS = 2 * 60_000;          // 2 minutes no activity → pause
const SESSION_GAP_TIMEOUT_MS = 15 * 60_000;  // 15 min gap → new session
const ACTIVITY_CHECK_MS = 30_000;            // check idle every 30s

// ── Session storage keys ───────────────────────────────────
const SESSION_LOG_ID_KEY = "activeSessionLogId";
const SESSION_START_KEY = "activeSessionStartTime";
const SESSION_LAST_HB_KEY = "activeSessionLastHeartbeat";

// ── Module state ───────────────────────────────────────────
let userId: string | null = null;
let userEmail: string | null = null;
let accessToken: string | null = null;
let sessionLogId: string | null = null;
let sessionStartMs: number | null = null;
let lastHeartbeatMs: number | null = null;
let lastActivityMs = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;
let isIdle = false;
let isRunning = false;

// ── Helpers ────────────────────────────────────────────────
function ss(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key: string, v: string) {
  try { sessionStorage.setItem(key, v); } catch {}
}
function ssRemove(key: string) {
  try { sessionStorage.removeItem(key); } catch {}
}

function onActivity() {
  lastActivityMs = Date.now();
  if (isIdle) {
    isIdle = false;
    // Resuming from idle — check if gap is too large
    const now = Date.now();
    if (lastHeartbeatMs && now - lastHeartbeatMs > SESSION_GAP_TIMEOUT_MS) {
      // Gap too large — end old session, start new one
      void endAndStartNew();
    } else {
      // Small gap — just resume heartbeats
      startHeartbeat();
    }
  }
}

// Debounce activity listeners — we only care about recency
let activityDebounce: ReturnType<typeof setTimeout> | null = null;
function onActivityDebounced() {
  if (activityDebounce) return;
  activityDebounce = setTimeout(() => { activityDebounce = null; }, 5000);
  onActivity();
}

// ── Core: create session row ───────────────────────────────
async function createSessionRow(): Promise<string | null> {
  if (!userId || !userEmail) return null;
  const now = new Date();
  const detail = JSON.stringify({
    session_start: now.toISOString(),
    last_heartbeat: now.toISOString(),
    duration_minutes: 0,
  });
  try {
    const { data, error } = await (supabase.from("data_log") as any)
      .insert({
        project_id: "_system_",
        user_id: userId,
        user_email: userEmail,
        action_type: "user_session",
        old_value: null,
        new_value: null,
        detail,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    const id = data?.id ?? null;
    const startMs = data?.created_at ? new Date(data.created_at).getTime() : now.getTime();
    if (id) {
      sessionLogId = id;
      sessionStartMs = startMs;
      lastHeartbeatMs = now.getTime();
      ssSet(SESSION_LOG_ID_KEY, id);
      ssSet(SESSION_START_KEY, String(startMs));
      ssSet(SESSION_LAST_HB_KEY, String(now.getTime()));
    }
    return id;
  } catch (e) {
    console.error("Session create error:", e);
    return null;
  }
}

// ── Core: heartbeat (update existing row) ──────────────────
async function sendHeartbeat() {
  if (!sessionLogId || !userId || !sessionStartMs) return;
  const now = Date.now();
  const durationMin = Math.max(0, Math.round((now - sessionStartMs) / 60_000));
  const detail = JSON.stringify({
    session_start: new Date(sessionStartMs).toISOString(),
    last_heartbeat: new Date(now).toISOString(),
    duration_minutes: durationMin,
  });
  lastHeartbeatMs = now;
  ssSet(SESSION_LAST_HB_KEY, String(now));
  try {
    await (supabase.from("data_log") as any)
      .update({ detail })
      .eq("id", sessionLogId)
      .eq("user_id", userId)
      .eq("action_type", "user_session");
  } catch (e) {
    console.error("Heartbeat error:", e);
  }
}

// ── Timers ─────────────────────────────────────────────────
function startHeartbeat() {
  stopHeartbeat();
  // Immediate heartbeat on resume
  void sendHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!isIdle) void sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startIdleCheck() {
  stopIdleCheck();
  idleCheckTimer = setInterval(() => {
    if (lastActivityMs && Date.now() - lastActivityMs > IDLE_TIMEOUT_MS && !isIdle) {
      isIdle = true;
      stopHeartbeat();
      // Send one final heartbeat to mark last active time
      void sendHeartbeat();
    }
  }, ACTIVITY_CHECK_MS);
}

function stopIdleCheck() {
  if (idleCheckTimer) { clearInterval(idleCheckTimer); idleCheckTimer = null; }
}

// ── Visibility change ──────────────────────────────────────
function onVisibilityChange() {
  if (document.hidden) {
    // Tab hidden — pause heartbeats but don't end session
    stopHeartbeat();
    void sendHeartbeat(); // one last heartbeat
  } else {
    // Tab visible again
    onActivity(); // triggers resume logic with gap check
  }
}

// ── beforeunload — best-effort final heartbeat via sendBeacon
function onBeforeUnload() {
  if (!sessionLogId || !userId || !sessionStartMs) return;
  const now = Date.now();
  const durationMin = Math.max(0, Math.round((now - sessionStartMs) / 60_000));
  const detail = JSON.stringify({
    session_start: new Date(sessionStartMs).toISOString(),
    last_heartbeat: new Date(now).toISOString(),
    duration_minutes: durationMin,
  });
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key || !accessToken) return;

  const query =
    `id=eq.${encodeURIComponent(sessionLogId)}` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&action_type=eq.user_session`;
  const url = `${baseUrl}/rest/v1/data_log?${query}`;

  // Try sendBeacon first (more reliable on unload), fallback to keepalive fetch
  const body = JSON.stringify({ detail });
  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
    Prefer: "return=minimal",
  };

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon doesn't support custom headers, so use fetch with keepalive
    try {
      fetch(url, { method: "PATCH", headers, body, keepalive: true });
    } catch {}
  } else {
    try {
      fetch(url, { method: "PATCH", headers, body, keepalive: true });
    } catch {}
  }
}

// ── End current & start new session (after long idle gap) ──
async function endAndStartNew() {
  // Final heartbeat on old session
  await sendHeartbeat();
  // Reset session pointers
  sessionLogId = null;
  sessionStartMs = null;
  lastHeartbeatMs = null;
  ssRemove(SESSION_LOG_ID_KEY);
  ssRemove(SESSION_START_KEY);
  ssRemove(SESSION_LAST_HB_KEY);
  // Create new session
  await createSessionRow();
  startHeartbeat();
}

// ── Public API ─────────────────────────────────────────────

/**
 * Start tracking session. Called after login or on app load with existing session.
 */
export function startSession(uid: string, email: string, token?: string) {
  userId = uid;
  userEmail = email;
  accessToken = token ?? null;

  if (isRunning) return;

  // Try to hydrate from sessionStorage (same tab reload)
  const storedId = ss(SESSION_LOG_ID_KEY);
  const storedStart = ss(SESSION_START_KEY);
  const storedHb = ss(SESSION_LAST_HB_KEY);

  if (storedId && storedStart) {
    const lastHb = storedHb ? Number(storedHb) : Number(storedStart);
    const gap = Date.now() - lastHb;
    if (gap < SESSION_GAP_TIMEOUT_MS) {
      // Resume existing session
      sessionLogId = storedId;
      sessionStartMs = Number(storedStart);
      lastHeartbeatMs = lastHb;
    } else {
      // Too old — will create new
      ssRemove(SESSION_LOG_ID_KEY);
      ssRemove(SESSION_START_KEY);
      ssRemove(SESSION_LAST_HB_KEY);
    }
  }

  isRunning = true;
  lastActivityMs = Date.now();

  // Attach activity listeners
  window.addEventListener("mousemove", onActivityDebounced, { passive: true });
  window.addEventListener("keydown", onActivityDebounced, { passive: true });
  window.addEventListener("click", onActivityDebounced, { passive: true });
  window.addEventListener("scroll", onActivityDebounced, { passive: true });
  window.addEventListener("touchstart", onActivityDebounced, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  if (!sessionLogId) {
    // Create new session, then start heartbeat
    void createSessionRow().then(() => startHeartbeat());
  } else {
    startHeartbeat();
  }

  startIdleCheck();
}

/**
 * End session explicitly (sign-out).
 */
export async function endSession() {
  if (sessionLogId && sessionStartMs) {
    await sendHeartbeat();
  }
  cleanup();
}

function cleanup() {
  stopHeartbeat();
  stopIdleCheck();

  window.removeEventListener("mousemove", onActivityDebounced);
  window.removeEventListener("keydown", onActivityDebounced);
  window.removeEventListener("click", onActivityDebounced);
  window.removeEventListener("scroll", onActivityDebounced);
  window.removeEventListener("touchstart", onActivityDebounced);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("beforeunload", onBeforeUnload);

  ssRemove(SESSION_LOG_ID_KEY);
  ssRemove(SESSION_START_KEY);
  ssRemove(SESSION_LAST_HB_KEY);

  userId = null;
  userEmail = null;
  accessToken = null;
  sessionLogId = null;
  sessionStartMs = null;
  lastHeartbeatMs = null;
  lastActivityMs = 0;
  isIdle = false;
  isRunning = false;
  if (activityDebounce) { clearTimeout(activityDebounce); activityDebounce = null; }
}

export function resetSessionTracking() {
  cleanup();
}
