import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { Project } from "./useProjects";

/**
 * Given a parent project and existing project IDs, generate the next subproject ID.
 * Pattern: parentId + "-A", "-B", etc.
 */
function generateSubprojectId(parentId: string, allProjectIds: string[]): string {
  const existing = allProjectIds
    .filter((id) => id.startsWith(parentId + "-") && id.length === parentId.length + 2)
    .map((id) => id.charAt(id.length - 1))
    .filter((c) => /^[A-Z]$/.test(c))
    .sort();

  const lastChar = existing.length > 0 ? existing[existing.length - 1] : null;
  const nextChar = lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
  return `${parentId}-${nextChar}`;
}

/** Fields to copy from parent to subproject */
const INHERIT_FIELDS: (keyof Project)[] = [
  "project_name", "klient", "pm", "konstrukter", "kalkulant",
  "status", "datum_smluvni", "prodejni_cena", "currency", "marze",
  "location", "architekt", "fakturace", "datum_objednavky",
  "risk", "narocnost", "dm", "velikost_zakazky",
];

export interface FreshSubproject {
  projectId: string;
  touchedFields: Set<string>;
}

export function useSubprojectCreation(allProjects: Project[]) {
  const qc = useQueryClient();
  const [freshMap, setFreshMap] = useState<Map<string, FreshSubproject>>(new Map());
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const freshRef = useRef(freshMap);
  freshRef.current = freshMap;

  const allProjectIds = allProjects.map((p) => p.project_id);

  const createSubproject = useCallback(async (parent: Project) => {
    const newId = generateSubprojectId(parent.project_id, allProjectIds);

    // Build insert payload from parent
    const payload: Record<string, any> = {
      project_id: newId,
      project_name: parent.project_name || "",
    };
    for (const field of INHERIT_FIELDS) {
      if (field === "project_name") continue; // already set
      const val = (parent as any)[field];
      if (val !== null && val !== undefined) {
        payload[field] = val;
      }
    }

    const { error } = await supabase.from("projects").insert(payload as any);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return null;
    }

    // Track as fresh
    setFreshMap((prev) => {
      const next = new Map(prev);
      next.set(newId, { projectId: newId, touchedFields: new Set(["project_id"]) });
      return next;
    });

    qc.invalidateQueries({ queryKey: ["projects"] });
    toast({ title: "Podprojekt vytvořen", description: newId });
    return newId;
  }, [allProjectIds, qc]);

  const markFieldTouched = useCallback((projectId: string, field: string) => {
    setFreshMap((prev) => {
      const entry = prev.get(projectId);
      if (!entry) return prev;
      const next = new Map(prev);
      const touched = new Set(entry.touchedFields);
      touched.add(field);
      next.set(projectId, { ...entry, touchedFields: touched });
      return next;
    });
  }, []);

  const finalize = useCallback((projectId: string) => {
    setFreshMap((prev) => {
      if (!prev.has(projectId)) return prev;
      const next = new Map(prev);
      next.delete(projectId);
      return next;
    });
  }, []);

  const finalizeAll = useCallback(() => {
    if (freshMap.size > 0) {
      setFreshMap(new Map());
    }
  }, [freshMap.size]);

  const requestCancel = useCallback((projectId: string) => {
    setCancelConfirm(projectId);
  }, []);

  const confirmCancel = useCallback(async (projectId: string) => {
    // Delete from Supabase
    const project = allProjects.find((p) => p.project_id === projectId);
    if (project) {
      await supabase.from("projects").delete().eq("id", project.id);
    }
    setFreshMap((prev) => {
      const next = new Map(prev);
      next.delete(projectId);
      return next;
    });
    setCancelConfirm(null);
    qc.invalidateQueries({ queryKey: ["projects"] });
    toast({ title: "Podprojekt zrušen" });
  }, [allProjects, qc]);

  const dismissCancel = useCallback(() => {
    setCancelConfirm(null);
  }, []);

  const isFresh = useCallback((projectId: string) => freshMap.has(projectId), [freshMap]);

  const isFieldInherited = useCallback((projectId: string, field: string) => {
    const entry = freshMap.get(projectId);
    if (!entry) return false;
    return !entry.touchedFields.has(field);
  }, [freshMap]);

  return {
    createSubproject,
    markFieldTouched,
    finalize,
    finalizeAll,
    isFresh,
    isFieldInherited,
    freshMap,
    cancelConfirm,
    requestCancel,
    confirmCancel,
    dismissCancel,
  };
}
