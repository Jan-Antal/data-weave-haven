import { supabase } from "@/integrations/supabase/client";

let lastTrackedUserId: string | null = null;
let lastLoginTime = 0;

const LOGIN_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export const LAST_LOGIN_LOGGED_AT_KEY = "lastLoginLoggedAt";
export const ACTIVE_LOGIN_LOG_ID_KEY = "activeLoginLogId";
export const ACTIVE_SESSION_START_KEY = "activeSessionStartTime";
export const ACTIVE_LOGIN_DETAIL_KEY = "activeLoginDetail";

type LoginDetail = Record<string, unknown>;

export interface LoginTrackingResult {
  logged: boolean;
  logId: string | null;
  sessionStartMs: number | null;
  detail: LoginDetail | null;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getSessionValue(key: string): string | null {
  if (!canUseSessionStorage()) return null;
  return window.sessionStorage.getItem(key);
}

function setSessionValue(key: string, value: string) {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(key, value);
}

function parseDetail(detail: string | null | undefined): LoginDetail | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as LoginDetail;
  } catch {
    return null;
  }
}

/** Generate a UUID client-side so we don't need .select() after insert */
function uuidv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function hasLoginLoggedInCurrentTab() {
  return Boolean(getSessionValue(LAST_LOGIN_LOGGED_AT_KEY));
}

/**
 * Log a login event only once per browser tab session and deduplicate within 30 minutes.
 * Works for ALL roles — no .select() calls that would fail for viewers/konstrukters.
 */
export async function logLoginEvent(userId: string, email: string): Promise<LoginTrackingResult> {
  const now = Date.now();

  // Tab-level guard: if this tab already logged a login, don't log again.
  if (hasLoginLoggedInCurrentTab()) {
    return {
      logged: false,
      logId: getSessionValue(ACTIVE_LOGIN_LOG_ID_KEY),
      sessionStartMs: Number(getSessionValue(ACTIVE_SESSION_START_KEY) ?? "") || null,
      detail: parseDetail(getSessionValue(ACTIVE_LOGIN_DETAIL_KEY)),
    };
  }

  // In-memory dedup for rapid repeated calls in same runtime.
  if (lastTrackedUserId === userId && now - lastLoginTime < LOGIN_DEDUP_WINDOW_MS) {
    return {
      logged: false,
      logId: getSessionValue(ACTIVE_LOGIN_LOG_ID_KEY),
      sessionStartMs: Number(getSessionValue(ACTIVE_SESSION_START_KEY) ?? "") || null,
      detail: parseDetail(getSessionValue(ACTIVE_LOGIN_DETAIL_KEY)),
    };
  }

  // DB dedup — wrapped in try/catch because Viewers can't SELECT from data_log.
  // If SELECT fails, we skip dedup and rely on tab-level + in-memory guards.
  try {
    const thirtyMinAgo = new Date(now - LOGIN_DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await (supabase.from("data_log") as any)
      .select("id, created_at, detail")
      .eq("action_type", "user_login")
      .eq("user_id", userId)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) {
      const recentEntry = recent[0];
      const startMs = new Date(recentEntry.created_at).getTime();
      const parsedDetail = parseDetail(recentEntry.detail);

      setSessionValue(LAST_LOGIN_LOGGED_AT_KEY, String(now));
      setSessionValue(ACTIVE_LOGIN_LOG_ID_KEY, recentEntry.id);
      setSessionValue(ACTIVE_SESSION_START_KEY, String(startMs));
      if (parsedDetail) {
        setSessionValue(ACTIVE_LOGIN_DETAIL_KEY, JSON.stringify(parsedDetail));
      }

      lastTrackedUserId = userId;
      lastLoginTime = now;

      return {
        logged: false,
        logId: recentEntry.id,
        sessionStartMs: startMs,
        detail: parsedDetail,
      };
    }
  } catch {
    // SELECT not allowed for this role — skip dedup, proceed to insert
  }

  // Generate ID client-side so we don't need .select() after insert
  const logId = uuidv4();
  const baseDetail: LoginDetail = {
    email,
    login_method: "password",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  };

  try {
    const { error } = await (supabase.from("data_log") as any)
      .insert({
        id: logId,
        project_id: "_system_",
        user_id: userId,
        user_email: email,
        action_type: "user_login",
        old_value: null,
        new_value: null,
        detail: JSON.stringify(baseDetail),
      });

    if (error) throw error;

    const sessionStartMs = now;

    setSessionValue(LAST_LOGIN_LOGGED_AT_KEY, String(now));
    setSessionValue(ACTIVE_LOGIN_LOG_ID_KEY, logId);
    setSessionValue(ACTIVE_SESSION_START_KEY, String(sessionStartMs));
    setSessionValue(ACTIVE_LOGIN_DETAIL_KEY, JSON.stringify(baseDetail));

    lastTrackedUserId = userId;
    lastLoginTime = now;

    console.log(`[LoginTracking] Logged login for ${email}`);

    return {
      logged: true,
      logId,
      sessionStartMs,
      detail: baseDetail,
    };
  } catch (e) {
    console.error("Login tracking error:", e);
    return {
      logged: false,
      logId: null,
      sessionStartMs: null,
      detail: null,
    };
  }
}

export function resetLoginTracking() {
  lastTrackedUserId = null;
  lastLoginTime = 0;
}
