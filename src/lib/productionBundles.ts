import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type BundleType = "full" | "split";

export interface BundleTarget {
  project_id: string;
  weekKey?: string | null;
  stage_id: string | null;
  bundle_label: string | null;
  bundle_type: BundleType | null;
  bundle_key?: string | null;
  split_group_id?: string | null;
  split_part?: number | null;
  split_total?: number | null;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function resolveBundleType(row: {
  bundle_type?: string | null;
  split_group_id?: string | null;
  split_part?: number | null;
  split_total?: number | null;
}): BundleType {
  if (row.bundle_type === "split" || row.bundle_type === "full") return row.bundle_type;
  return row.split_group_id || row.split_part || row.split_total ? "split" : "full";
}

export function fallbackBundleLabel(seed: string | null | undefined): string {
  const value = seed || "A";
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % LETTERS.length;
  return LETTERS[hash] || "A";
}

export function buildBundleKey(target: {
  weekKey: string;
  project_id: string;
  stage_id: string | null;
  bundle_label: string | null;
  split_part?: number | null;
}): string {
  return [
    target.weekKey,
    target.project_id,
    target.stage_id ?? "none",
    target.bundle_label ?? "none",
    target.split_part ?? "full",
  ].map((part) => encodeURIComponent(String(part))).join("::");
}

export function formatBundleDisplayLabel(target: {
  bundle_label: string | null;
  split_part?: number | null;
  bundle_type?: BundleType | null;
}): string {
  const label = target.bundle_label || "A";
  return target.bundle_type === "split" && target.split_part ? `${label}-${target.split_part}` : label;
}

export function deriveBundleSplitMeta<T extends {
  bundle_type?: string | null;
  split_group_id?: string | null;
  split_part?: number | null;
  split_total?: number | null;
}>(rows: T[]): { isSplit: boolean; splitPart: number | null; splitTotal: number | null } {
  const splitRows = rows.filter((row) => resolveBundleType(row) === "split");
  if (splitRows.length === 0) {
    return { isSplit: false, splitPart: null, splitTotal: null };
  }

  const partCandidate = splitRows.find((row) => typeof row.split_part === "number" && row.split_part > 0)?.split_part ?? null;
  const totalCandidate = splitRows.find((row) => typeof row.split_total === "number" && row.split_total > 0)?.split_total ?? null;

  return {
    isSplit: true,
    splitPart: partCandidate,
    splitTotal: totalCandidate,
  };
}

export async function getNextBundleLabel(projectId: string, stageId: string | null): Promise<string> {
  let query = supabase
    .from("production_schedule")
    .select("project_id, stage_id, scheduled_week, position, bundle_label, bundle_type, split_group_id, split_part, split_total")
    .eq("project_id", projectId)
    .not("bundle_label", "is", null);

  query = stageId ? query.eq("stage_id", stageId) : query.is("stage_id", null);

  const { data, error } = await query;
  if (error) throw error;

  const used = new Set((data || []).map((r: any) => r.bundle_label || fallbackBundleLabel(r.split_group_id ?? `${r.project_id}:${r.stage_id ?? "none"}:${r.scheduled_week}:${r.position}`)).filter(Boolean));
  return LETTERS.find((letter) => !used.has(letter)) || LETTERS[used.size % LETTERS.length] || "A";
}

export async function buildNewBundleAssignment(projectId: string, stageId: string | null, forceType: BundleType = "full") {
  return {
    bundle_label: await getNextBundleLabel(projectId, stageId),
    bundle_type: forceType,
  };
}

export function validateBundleDrop(source: BundleTarget, target: BundleTarget): boolean {
  const sourceStage = source.stage_id ?? null;
  const targetStage = target.stage_id ?? null;
  if (sourceStage !== targetStage) {
    toast({ title: "Položky rôznych etáp nie je možné spájať", variant: "destructive" });
    return false;
  }

  const sourceType = resolveBundleType(source);
  const targetType = resolveBundleType(target);
  if (sourceType === "full" && targetType === "split") {
    toast({ title: "Celé položky nie je možné pridať do split bundlu", variant: "destructive" });
    return false;
  }
  if (sourceType === "split" && targetType === "full") {
    toast({ title: "Split položky nie je možné pridať do celého bundlu", variant: "destructive" });
    return false;
  }

  if (sourceType === "split" && targetType === "split") {
    const sourceLabel = source.bundle_label ?? null;
    const targetLabel = target.bundle_label ?? null;
    if (sourceLabel && targetLabel && sourceLabel !== targetLabel) {
      toast({ title: "Rôzne split série nie je možné spájať", variant: "destructive" });
      return false;
    }
  }

  return true;
}

export function canAcceptBundleDrop(source: BundleTarget | null | undefined, target: BundleTarget): boolean {
  if (!source) return false;
  if (source.bundle_key && target.bundle_key && source.bundle_key === target.bundle_key) return false;
  if (source.weekKey && target.weekKey && source.weekKey !== target.weekKey) return false;
  if (source.project_id !== target.project_id) return false;
  if ((source.stage_id ?? null) !== (target.stage_id ?? null)) return false;
  return resolveBundleType(source) === "full" && resolveBundleType(target) === "full";
}

export async function normalizeFullBundlesForWeek(projectId: string, stageId: string | null, weekKey: string): Promise<string | null> {
  let query = supabase
    .from("production_schedule")
    .select("id, project_id, stage_id, scheduled_week, position, bundle_label, bundle_type, split_group_id, split_part, split_total")
    .eq("project_id", projectId)
    .eq("scheduled_week", weekKey)
    .in("status", ["scheduled", "in_progress", "paused"])
    .order("position", { ascending: true });

  query = stageId ? query.eq("stage_id", stageId) : query.is("stage_id", null);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];
  const splitLabels = new Set(rows
    .filter((row: any) => resolveBundleType(row) === "split")
    .map((row: any) => row.bundle_label || fallbackBundleLabel(row.split_group_id ?? `${row.project_id}:${row.stage_id ?? "none"}:${row.scheduled_week}:${row.position}`))
    .filter(Boolean));
  const fullRows = rows.filter((row: any) => resolveBundleType(row) === "full");
  if (fullRows.length === 0) return null;

  const currentLabels = new Set(fullRows.map((row: any) => row.bundle_label).filter(Boolean));
  const preferred = fullRows.find((row: any) => row.bundle_label && !splitLabels.has(row.bundle_label))?.bundle_label;
  const targetLabel = preferred || LETTERS.find((letter) => !splitLabels.has(letter)) || "A";
  const needsUpdate = fullRows.length > 1 || currentLabels.size !== 1 || !currentLabels.has(targetLabel) || splitLabels.has(targetLabel);
  if (!needsUpdate) return targetLabel;

  const { error: updateError } = await supabase
    .from("production_schedule")
    .update({
      bundle_label: targetLabel,
      bundle_type: "full",
      split_group_id: null,
      split_part: null,
      split_total: null,
    } as any)
    .in("id", fullRows.map((row: any) => row.id));
  if (updateError) throw updateError;

  return targetLabel;
}
