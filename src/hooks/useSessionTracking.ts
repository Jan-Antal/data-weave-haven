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

/** Generate a UUID v4 client-side so we don't need SELECT after INSERT */
function uuidv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function onActivity() {
  lastActivityMs = Date.now();
  if (isIdle) {
    isIdle = false;
    const now = Date.now();
    if (lastHeartbeatMs && now - lastHeartbeatMs > SESSION_GAP_TIMEOUT_MS) {
      void endAndStartNew();
    } else {
      startHeartbeat();
    }
  }
}

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
  const id = uuidv4();
  const detail = JSON.stringify({
    session_start: now.toISOString(),
    last_heartbeat: now.toISOString(),
    duration_minutes: 0,
  });
  try {
    // Use client-generated ID — don't need .select() which requires SELECT permission
    const { error } = await (supabase.from("data_log") as any)
      .insert({
        id,
        project_id: "_system_",
        user_id: userId,
        user_email: userEmail,
        action_type: "user_session",
        old_value: null,
        new_value: null,
        detail,
      });
    if (error) throw error;

    sessionLogId = id;
    sessionStartMs = now.getTime();
    lastHeartbeatMs = now.getTime();
    ssSet(SESSION_LOG_ID_KEY, id);
    ssSet(SESSION_START_KEY, String(now.getTime()));
    ssSet(SESSION_LAST_HB_KEY, String(now.getTime()));
    console.log(`[Session] Created session ${id.slice(0, 8)} for ${userEmail}`);
    return id;
  } catch (e) {
    console.error("[Session] Create error:", e);
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
    // Update by id + user_id + action_type (matches RLS policy)
    const { error } = await (supabase.from("data_log") as any)
      .update({ detail })
      .eq("id", sessionLogId)
      .eq("user_id", userId)
      .eq("action_type", "user_session");
    if (error) {
      console.warn("[Session] Heartbeat update failed:", error.message);
    }
  } catch (e) {
    console.error("[Session] Heartbeat error:", e);
  }
}

// ── Timers ─────────────────────────────────────────────────
function startHeartbeat() {
  stopHeartbeat();
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
    stopHeartbeat();
    void sendHeartbeat();
  } else {
    onActivity();
  }
}

// ── beforeunload — best-effort final heartbeat ─────────────
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
  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
    Prefer: "return=minimal",
  };
  const body = JSON.stringify({ detail });
  try {
    fetch(url, { method: "PATCH", headers, body, keepalive: true });
  } catch {}
}

// ── End current & start new session ────────────────────────
async function endAndStartNew() {
  await sendHeartbeat();
  sessionLogId = null;
  sessionStartMs = null;
  lastHeartbeatMs = null;
  ssRemove(SESSION_LOG_ID_KEY);
  ssRemove(SESSION_START_KEY);
  ssRemove(SESSION_LAST_HB_KEY);
  await createSessionRow();
  startHeartbeat();
}

// ── Public API ─────────────────────────────────────────────

export function startSession(uid: string, email: string, token?: string) {
  // Always update the access token (it refreshes)
  accessToken = token ?? null;
  userId = uid;
  userEmail = email;

  if (isRunning) return;

  // Try to hydrate from sessionStorage (same tab reload)
  const storedId = ss(SESSION_LOG_ID_KEY);
  const storedStart = ss(SESSION_START_KEY);
  const storedHb = ss(SESSION_LAST_HB_KEY);

  if (storedId && storedStart) {
    const lastHb = storedHb ? Number(storedHb) : Number(storedStart);
    const gap = Date.now() - lastHb;
    if (gap < SESSION_GAP_TIMEOUT_MS) {
      sessionLogId = storedId;
      sessionStartMs = Number(storedStart);
      lastHeartbeatMs = lastHb;
      console.log(`[Session] Resumed session ${storedId.slice(0, 8)} for ${email} (gap ${Math.round(gap / 1000)}s)`);
    } else {
      ssRemove(SESSION_LOG_ID_KEY);
      ssRemove(SESSION_START_KEY);
      ssRemove(SESSION_LAST_HB_KEY);
    }
  }

  isRunning = true;
  lastActivityMs = Date.now();

  window.addEventListener("mousemove", onActivityDebounced, { passive: true });
  window.addEventListener("keydown", onActivityDebounced, { passive: true });
  window.addEventListener("click", onActivityDebounced, { passive: true });
  window.addEventListener("scroll", onActivityDebounced, { passive: true });
  window.addEventListener("touchstart", onActivityDebounced, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  if (!sessionLogId) {
    void createSessionRow().then(() => {
      if (sessionLogId) startHeartbeat();
    });
  } else {
    startHeartbeat();
  }

  startIdleCheck();
}

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
