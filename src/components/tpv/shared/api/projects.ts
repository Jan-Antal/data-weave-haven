/**
 * Read-only API for projects (entity owned by Project Info module).
 * TPV tabs reference projects but never mutate them.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ProjectRef } from "../types";

const SELECT =
  "project_id, project_name, pm, konstrukter, status, klient, expedice, predani, is_active";

/** Single project by project_id (text PK). */
export async function fetchProject(
  projectId: string
): Promise<ProjectRef | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProjectRef | null;
}

/** All active projects (for project picker dropdowns). */
export async function fetchActiveProjects(): Promise<ProjectRef[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("project_id", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRef[];
}

/** Bulk fetch by project_ids (hydrating subcontract/material rows). */
export async function fetchProjectsByIds(
  projectIds: string[]
): Promise<ProjectRef[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .in("project_id", projectIds)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as ProjectRef[];
}
