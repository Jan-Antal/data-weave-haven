import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useStagesByProject } from "@/hooks/useAllProjectStages";

export interface AttentionItem {
  project: Project;
  severity: "critical" | "warning";
  message: string;
  icon: string;
}

export interface ProjectUrgency {
  severity: "critical" | "warning";
  label: string;
  count: number; // total issues
}

function getMonday(d: Date): string {
  const dt = new Date(d);
  const day = dt.getDay() || 7;
  dt.setDate(dt.getDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function useProjectAttention(pmName?: string | null) {
  const { data: projects = [] } = useProjects();
  const { stagesByProject } = useStagesByProject();

  // Fetch production schedule items that are scheduled/in_progress/paused
  const { data: scheduleItems = [] } = useQuery({
    queryKey: ["attention-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_schedule")
        .select("id, project_id, item_name, scheduled_week, status, pause_reason, pause_expected_date, cancel_reason")
        .in("status", ["scheduled", "in_progress", "paused", "cancelled"]);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentWeek = getMonday(today);
  const in7days = new Date(today);
  in7days.setDate(in7days.getDate() + 7);
  const in7daysStr = in7days.toISOString().slice(0, 10);

  // Build attention items per project
  const { attentionItems, urgencyMap, upcomingDates } = useMemo(() => {
    const items: AttentionItem[] = [];
    const urgMap = new Map<string, ProjectUrgency>();
    const upcoming: { date: Date; projectId: string; projectName: string; milestone: string; project: Project }[] = [];

    // Group schedule items by project
    const schedByProject = new Map<string, typeof scheduleItems>();
    for (const si of scheduleItems) {
      if (!schedByProject.has(si.project_id)) schedByProject.set(si.project_id, []);
      schedByProject.get(si.project_id)!.push(si);
    }

    const filteredProjects = pmName
      ? projects.filter(p => p.pm === pmName)
      : projects;

    const DONE_STATUSES = new Set(["Fakturace", "Dokončeno"]);

    for (const project of filteredProjects) {
      // Skip finished projects — they are not "po termínu"
      if (project.status && DONE_STATUSES.has(project.status)) continue;
      const issues: { severity: "critical" | "warning"; message: string; icon: string }[] = [];

      // Check production delays
      const sched = schedByProject.get(project.project_id) || [];
      const delayed = sched.filter(s =>
        (s.status === "scheduled" || s.status === "in_progress") &&
        s.scheduled_week < currentWeek
      );
      if (delayed.length > 0) {
        issues.push({
          severity: "critical",
          message: `${delayed.length}× Zpoždění ve výrobě`,
          icon: "🔴",
        });
      }

      // Check past datum_smluvni
      const ds = parseDate(project.datum_smluvni);
      if (ds && ds < today) {
        const diffDays = Math.floor((today.getTime() - ds.getTime()) / 86400000);
        issues.push({
          severity: "critical",
          message: `Po termínu ${diffDays} dní`,
          icon: "🔴",
        });
      }

      // Cancelled or blocked > 7 days
      const paused = sched.filter(s => s.status === "paused");
      if (paused.length > 0) {
        issues.push({
          severity: "warning",
          message: paused.length === 1
            ? `Pozastaveno — ${paused[0].pause_reason || "čeká"}`
            : `${paused.length}× Pozastaveno`,
          icon: "⏸",
        });
      }

      // Datum smluvni within 7 days
      if (ds && ds >= today && ds <= in7days) {
        const diffDays = Math.ceil((ds.getTime() - today.getTime()) / 86400000);
        issues.push({
          severity: "warning",
          message: `Termín za ${diffDays} dní`,
          icon: "⚠",
        });
      }

      // Build attention items
      for (const issue of issues) {
        items.push({ project, ...issue });
      }

      // Build urgency map
      if (issues.length > 0) {
        const mostCritical = issues.some(i => i.severity === "critical") ? "critical" : "warning";
        const primaryIssue = issues.find(i => i.severity === mostCritical) || issues[0];
        urgMap.set(project.project_id, {
          severity: mostCritical,
          label: primaryIssue.icon + " " + primaryIssue.message,
          count: issues.length,
        });
      }

      // Upcoming dates (for the dates section)
      const milestones: [string, string][] = [
        ["datum_smluvni", "Datum smluvní"],
        ["expedice", "Expedice"],
        ["montaz", "Montáž"],
        ["predani", "Předání"],
        ["van_date", "VaN"],
        ["tpv_date", "TPV"],
      ];
      for (const [field, label] of milestones) {
        const val = (project as any)[field];
        const d = parseDate(val);
        if (d && d >= today && d <= in7days) {
          upcoming.push({
            date: d,
            projectId: project.project_id,
            projectName: project.project_name,
            milestone: label,
            project,
          });
        }
      }

      // Also check stages
      const stages = stagesByProject.get(project.project_id) || [];
      for (const stage of stages) {
        for (const [field, label] of milestones) {
          const val = (stage as any)[field];
          const d = parseDate(val);
          if (d && d >= today && d <= in7days) {
            upcoming.push({
              date: d,
              projectId: project.project_id,
              projectName: `${project.project_name} — ${stage.stage_name}`,
              milestone: label,
              project,
            });
          }
        }
      }
    }

    // Sort attention: critical first, then warning
    items.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      return 0;
    });

    // Sort upcoming chronologically
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());

    return { attentionItems: items, urgencyMap: urgMap, upcomingDates: upcoming };
  }, [projects, scheduleItems, stagesByProject, pmName, currentWeek, todayStr]);

  return { attentionItems, urgencyMap, upcomingDates, projects };
}
