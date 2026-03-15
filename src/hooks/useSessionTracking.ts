import { supabase } from "@/integrations/supabase/client";

// ── Constants ──────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;    // 5 minutes
const IDLE_TIMEOUT_MS = 2 * 60_000;           // 2 minutes no activity → pause
const SESSION_GAP_TIMEOUT_MS = 15 * 60_000;   // 15 min gap → new session
const ACTIVITY_CHECK_MS = 30_000;             // check idle every 30s

// ── Session storage keys ───────────────────────────────────
const SESSION_ID_KEY = "userSessionId";
const SESSION_START_KEY = "userSessionStartTime";

// ── Module state ───────────────────────────────────────────
let userId: string | null = null;
let userEmail: string | null = null;
let userName: string | null = null;
let accessToken: string | null = null;
let sessionId: string | null = null;
let sessionStartMs: number | null = null;
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

function uuidv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function onActivity() {
  lastActivityMs = Date.now();
  if (isIdle) {
    isIdle = false;
    const storedStart = ss(SESSION_START_KEY);
    const gap = storedStart ? Date.now() - Number(storedStart) : SESSION_GAP_TIMEOUT_MS + 1;
    if (gap > SESSION_GAP_TIMEOUT_MS) {
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

// ── Core: create session row in user_sessions ──────────────
async function createSessionRow(): Promise<string | null> {
  if (!userId || !userEmail) return null;
  const id = uuidv4();
  try {
    const { error } = await (supabase.from("user_sessions") as any)
      .insert({
        id,
        user_id: userId,
        user_email: userEmail,
        user_name: userName ?? "",
        session_start: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      });
    if (error) throw error;

    sessionId = id;
    sessionStartMs = Date.now();
    ssSet(SESSION_ID_KEY, id);
    ssSet(SESSION_START_KEY, String(sessionStartMs));
    return id;
  } catch (e) {
    console.error("[Session] Create error:", e);
    return null;
  }
}

// ── Core: heartbeat (update last_activity) ─────────────────
async function sendHeartbeat() {
  if (!sessionId || !userId) return;
  try {
    const { error } = await (supabase.from("user_sessions") as any)
      .update({ last_activity: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (error) console.warn("[Session] Heartbeat failed:", error.message);
  } catch (e) {
    console.error("[Session] Heartbeat error:", e);
  }
}

// ── End session ────────────────────────────────────────────
async function endSessionRow() {
  if (!sessionId || !userId) return;
  try {
    const { error } = await (supabase.from("user_sessions") as any)
      .update({
        last_activity: new Date().toISOString(),
        session_end: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (error) console.warn("[Session] End failed:", error.message);
  } catch {}
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

// ── beforeunload — best-effort session end ─────────────────
function onBeforeUnload() {
  if (!sessionId || !userId) return;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key || !accessToken) return;

  const query = `id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}`;
  const url = `${baseUrl}/rest/v1/user_sessions?${query}`;
  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
    Prefer: "return=minimal",
  };
  const body = JSON.stringify({
    last_activity: new Date().toISOString(),
    session_end: new Date().toISOString(),
  });
  try {
    fetch(url, { method: "PATCH", headers, body, keepalive: true });
  } catch {}
}

// ── End current & start new session ────────────────────────
async function endAndStartNew() {
  await endSessionRow();
  sessionId = null;
  sessionStartMs = null;
  ssRemove(SESSION_ID_KEY);
  ssRemove(SESSION_START_KEY);
  await createSessionRow();
  startHeartbeat();
}

// ── Public API ─────────────────────────────────────────────

export function startSession(uid: string, email: string, token?: string, fullName?: string) {
  accessToken = token ?? null;
  userId = uid;
  userEmail = email;
  userName = fullName ?? null;

  if (isRunning) return;

  // Try to hydrate from sessionStorage (same tab reload)
  const storedId = ss(SESSION_ID_KEY);
  const storedStart = ss(SESSION_START_KEY);

  if (storedId && storedStart) {
    const gap = Date.now() - Number(storedStart);
    if (gap < SESSION_GAP_TIMEOUT_MS) {
      sessionId = storedId;
      sessionStartMs = Number(storedStart);
    } else {
      ssRemove(SESSION_ID_KEY);
      ssRemove(SESSION_START_KEY);
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

  if (!sessionId) {
    void createSessionRow().then(() => {
      if (sessionId) startHeartbeat();
    });
  } else {
    startHeartbeat();
  }

  startIdleCheck();
}

export async function endSession() {
  if (sessionId) {
    await endSessionRow();
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

  ssRemove(SESSION_ID_KEY);
  ssRemove(SESSION_START_KEY);

  userId = null;
  userEmail = null;
  userName = null;
  accessToken = null;
  sessionId = null;
  sessionStartMs = null;
  lastActivityMs = 0;
  isIdle = false;
  isRunning = false;
  if (activityDebounce) { clearTimeout(activityDebounce); activityDebounce = null; }
}

export function resetSessionTracking() {
  cleanup();
}
