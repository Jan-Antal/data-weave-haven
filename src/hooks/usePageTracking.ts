import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const PAGE_NAMES: Record<string, string> = {
  "/": "Přehled projektů",
  "/plan-vyroby": "Plán Výroby",
};

interface QueuedView {
  page_url: string;
  page_name: string;
  referrer_page: string;
  user_id: string;
  user_email: string;
  timestamp: string;
}

let viewQueue: QueuedView[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushQueue() {
  if (viewQueue.length === 0) return;
  const batch = [...viewQueue];
  viewQueue = [];

  const rows = batch.map((v) => ({
    project_id: "_system_",
    user_id: v.user_id,
    user_email: v.user_email,
    action_type: "page_view",
    old_value: null,
    new_value: v.page_name,
    detail: JSON.stringify({
      page_url: v.page_url,
      page_name: v.page_name,
      referrer_page: v.referrer_page,
    }),
  }));

  try {
    await (supabase.from("data_log") as any).insert(rows);
  } catch (e) {
    console.error("Page tracking flush error:", e);
  }
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flushQueue, 10_000);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function usePageTracking(pathname: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    startFlushTimer();
    return () => {
      flushQueue();
      stopFlushTimer();
    };
  }, []);

  useEffect(() => {
    // Don't track DataLog panel views
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const pageName = PAGE_NAMES[pathname] || pathname;
        const referrer = prevPathRef.current
          ? PAGE_NAMES[prevPathRef.current] || prevPathRef.current
          : "";

        viewQueue.push({
          page_url: pathname,
          page_name: pageName,
          referrer_page: referrer,
          user_id: user.id,
          user_email: user.email ?? "",
          timestamp: new Date().toISOString(),
        });

        prevPathRef.current = pathname;
      } catch (e) {
        console.error("Page tracking error:", e);
      }
    }, 2000); // 2s debounce

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pathname]);
}

/** Log a project detail view (called from dialog open) */
export async function logProjectDetailView(projectId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    viewQueue.push({
      page_url: `/project/${projectId}`,
      page_name: "Detail projektu",
      referrer_page: PAGE_NAMES[window.location.pathname] || window.location.pathname,
      user_id: user.id,
      user_email: user.email ?? "",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Project detail tracking error:", e);
  }
}
