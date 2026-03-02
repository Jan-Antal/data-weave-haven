import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ACHIEVEMENT_MAP, getPreviousTier } from "@/lib/achievements";
import type { AchievementDef } from "@/lib/achievements";

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_key: string;
  achieved_at: string;
}

export function useUserAchievements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_achievements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_achievements")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []) as UserAchievement[];
    },
  });
}

export function useGrantAchievement() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (achievementKey: string) => {
      if (!user) throw new Error("Not authenticated");
      // Check if already earned
      const { data: existing } = await (supabase as any)
        .from("user_achievements")
        .select("id")
        .eq("user_id", user.id)
        .eq("achievement_key", achievementKey)
        .maybeSingle();
      if (existing) return null; // Already earned

      const { data, error } = await (supabase as any)
        .from("user_achievements")
        .insert({ user_id: user.id, achievement_key: achievementKey })
        .select()
        .single();
      if (error) {
        // Unique constraint violation = already earned
        if (error.code === "23505") return null;
        throw error;
      }
      return data as UserAchievement;
    },
    onSuccess: (data) => {
      if (data) {
        qc.invalidateQueries({ queryKey: ["user_achievements"] });
        // Dispatch event for celebration
        const def = ACHIEVEMENT_MAP[data.achievement_key];
        if (def) {
          const prevTier = getPreviousTier(def);
          window.dispatchEvent(
            new CustomEvent("achievement-unlocked", {
              detail: { achievement: def, previousTier: prevTier },
            })
          );
        }
      }
    },
  });
}

// Lightweight checker — call after relevant actions
export function useAchievementChecker() {
  const { user, profile } = useAuth();
  const grant = useGrantAchievement();

  const checkTimeBasedAchievements = () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 6=Sat

    if (hour >= 22 || hour < 5) grant.mutate("night_shift");
    if (day === 0 || day === 6) grant.mutate("weekend");
    if (hour >= 4 && hour < 7) grant.mutate("early_bird");
  };

  const checkProjectCreated = async () => {
    grant.mutate("first_project");
    // Check 100th project
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null);
    if (count && count >= 100) grant.mutate("hundredth_project");
  };

  const checkPMTier = async (personName: string) => {
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("pm", personName)
      .is("deleted_at", null);
    if (!count) return;
    if (count >= 100) grant.mutate("pm_100");
    else if (count >= 50) grant.mutate("pm_50");
    else if (count >= 20) grant.mutate("pm_20");
    else if (count >= 5) grant.mutate("pm_5");
  };

  const checkKonstrukterTier = async () => {
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("percent_tpv", 100)
      .is("deleted_at", null);
    if (!count) return;
    if (count >= 100) grant.mutate("konstr_100");
    else if (count >= 50) grant.mutate("konstr_50");
    else if (count >= 25) grant.mutate("konstr_25");
    else if (count >= 10) grant.mutate("konstr_10");
    else if (count >= 1) grant.mutate("konstr_1");
  };

  const checkSearchCount = () => {
    const count = parseInt(localStorage.getItem("search_count") || "0", 10) + 1;
    localStorage.setItem("search_count", String(count));
    if (count >= 50) grant.mutate("search_50");
  };

  const checkPlanViewCount = () => {
    const count = parseInt(localStorage.getItem("plan_view_count") || "0", 10) + 1;
    localStorage.setItem("plan_view_count", String(count));
    if (count >= 20) grant.mutate("plan_20");
  };

  const checkExcelImportCount = () => {
    const count = parseInt(localStorage.getItem("excel_import_count") || "0", 10) + 1;
    localStorage.setItem("excel_import_count", String(count));
    if (count >= 5) grant.mutate("excel_5");
  };

  const checkFirstDocument = () => {
    grant.mutate("first_doc");
  };

  const checkDiamondProject = (price: number) => {
    if (price >= 10_000_000) grant.mutate("diamond");
  };

  const checkCleanerAchievement = async () => {
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null);
    if (count && count >= 10) grant.mutate("cleaner");
  };

  return {
    checkTimeBasedAchievements,
    checkProjectCreated,
    checkPMTier,
    checkKonstrukterTier,
    checkSearchCount,
    checkPlanViewCount,
    checkExcelImportCount,
    checkFirstDocument,
    checkDiamondProject,
    checkCleanerAchievement,
  };
}
