import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { SafetyNetProject } from "@/components/production/ForecastSafetyNet";

export type ForecastConfidence = "high" | "medium" | "low";
export type ForecastSource = "existing_plan" | "inbox_item" | "project_estimate";
export type ForecastPlanMode = "respect_plan" | "from_scratch";

export interface ForecastBlock {
  id: string;
  project_id: string;
  project_name: string;
  bundle_description: string;
  week: string;
  estimated_hours: number;
  tpv_item_count?: number;
  confidence: ForecastConfidence;
  source: ForecastSource;
  deadline?: string | null;
  deadline_source?: string;
  tpv_expected_date?: string | null;
  is_forecast: true;
  selected?: boolean;
  estimation_level?: number;  // 1=rozpad, 2=odhad s marží, 3=odhad def marže, 4=chybí podklady
  estimation_badge?: string;
  estimation_preset?: string;
}

/** Tracks a real bundle move that only lives in forecast state */
export interface RealBundleOverride {
  projectId: string;
  projectName: string;
  originalWeek: string;
  newWeek: string;
  hours: number;
  itemCount: number;
}

const STORAGE_KEYS: Record<ForecastPlanMode, string> = {
  respect_plan: "ami_forecast_session",
  from_scratch: "ami_forecast_session_scratch",
};

function saveToStorage(mode: ForecastPlanMode, blocks: ForecastBlock[], selectedIds: Set<string>, overrides: RealBundleOverride[], safetyNet: SafetyNetProject[]) {
  try {
    localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify({
      blocks,
      selectedBlockIds: Array.from(selectedIds),
      realBundleOverrides: overrides,
      safetyNetProjects: safetyNet,
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

function isTestProjectId(pid: string): boolean {
  return /^TEST/i.test(pid) || /^Z-22\d{2}-/i.test(pid);
}

function loadFromStorage(mode: ForecastPlanMode): { blocks: ForecastBlock[]; selectedIds: Set<string>; overrides: RealBundleOverride[]; safetyNet: SafetyNetProject[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[mode]);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.blocks) || data.blocks.length === 0) return null;
    // Filter out stale test/demo project data from cached sessions
    const blocks = data.blocks.filter((b: ForecastBlock) => !isTestProjectId(b.project_id));
    const safetyNet = (Array.isArray(data.safetyNetProjects) ? data.safetyNetProjects : [])
      .filter((s: SafetyNetProject) => !isTestProjectId(s.project_id));
    if (blocks.length === 0) return null;
    return {
      blocks,
      selectedIds: new Set<string>(data.selectedBlockIds || []),
      overrides: (data.realBundleOverrides || []).filter((o: RealBundleOverride) => !isTestProjectId(o.projectId)),
      safetyNet,
    };
  } catch {
    return null;
  }
}

function clearStorage(mode: ForecastPlanMode) {
  try { localStorage.removeItem(STORAGE_KEYS[mode]); } catch { /* ignore */ }
}

interface UseForecastModeReturn {
  forecastActive: boolean;
  setForecastActive: (v: boolean) => void;
  planMode: ForecastPlanMode;
  setPlanMode: (m: ForecastPlanMode) => void;
  forecastBlocks: ForecastBlock[];
  isGenerating: boolean;
  selectedBlockIds: Set<string>;
  toggleBlockSelection: (id: string) => void;
  selectAll: () => void;
  selectInboxOnly: () => void;
  toggleInboxSelection: () => void;
  deselectAll: () => void;
  generateForecast: (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => Promise<void>;
  clearForecast: () => void;
  commitBlocks: (blockIds?: string[]) => Promise<void>;
  commitInboxOnly: () => Promise<void>;
  moveForecastBlock: (blockId: string, newWeek: string) => void;
  removeForecastBlock: (blockId: string) => void;
  addForecastBlock: (block: ForecastBlock) => void;
  splitForecastBlock: (blockId: string, keepHours: number, splitWeek: string) => void;
  resetAndRegenerate: (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => Promise<void>;
  loadSavedSession: (modeOverride?: ForecastPlanMode) => boolean;
  /** Track a real bundle drag as a forecast-only override */
  realBundleOverrides: RealBundleOverride[];
  addRealBundleOverride: (projectId: string, projectName: string, originalWeek: string, newWeek: string, hours: number, itemCount: number) => void;
  /** Commit real bundle overrides to Supabase via moveBundleToWeek */
  commitRealBundleOverrides: (moveBundleToWeek: (projectId: string, sourceWeek: string, targetWeek: string) => Promise<void>) => Promise<void>;
  safetyNetProjects: SafetyNetProject[];
  restoreFromSafetyNet: (projectId: string) => void;
  restoreToWeek: (projectId: string, targetWeek: string) => void;
}

export function useForecastMode(): UseForecastModeReturn {
  const queryClient = useQueryClient();
  const [forecastActive, setForecastActiveRaw] = useState(false);
  const [planMode, setPlanModeRaw] = useState<ForecastPlanMode>("respect_plan");
  const [forecastBlocks, setForecastBlocks] = useState<ForecastBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [realBundleOverrides, setRealBundleOverrides] = useState<RealBundleOverride[]>([]);
  const [safetyNetProjects, setSafetyNetProjects] = useState<SafetyNetProject[]>([]);
  const generationTokenRef = useRef(0);

  // Persist to localStorage whenever blocks or selection changes
  useEffect(() => {
    if (forecastActive && forecastBlocks.length > 0) {
      saveToStorage(planMode, forecastBlocks, selectedBlockIds, realBundleOverrides, safetyNetProjects);
    }
  }, [forecastBlocks, selectedBlockIds, planMode, forecastActive, realBundleOverrides, safetyNetProjects]);

  const resetForecastState = useCallback(() => {
    setForecastBlocks([]);
    setSelectedBlockIds(new Set());
    setRealBundleOverrides([]);
    setSafetyNetProjects([]);
    setIsGenerating(false);
  }, []);

  const loadSavedSession = useCallback((modeOverride?: ForecastPlanMode): boolean => {
    const mode = modeOverride ?? planMode;
    const saved = loadFromStorage(mode);
    if (saved) {
      setForecastBlocks(saved.blocks);
      setSelectedBlockIds(saved.selectedIds);
      setRealBundleOverrides(saved.overrides);
      setSafetyNetProjects(saved.safetyNet);
      return true;
    }
    return false;
  }, [planMode]);

  const setPlanMode = useCallback((m: ForecastPlanMode) => {
    setPlanModeRaw(m);
  }, []);

  const setForecastActive = useCallback((v: boolean) => {
    setForecastActiveRaw(v);
    if (!v) {
      generationTokenRef.current += 1;
      resetForecastState();
    }
  }, [resetForecastState]);

  const clearForecast = useCallback(() => {
    generationTokenRef.current += 1;
    resetForecastState();
  }, [resetForecastState]);

  const toggleBlockSelection = useCallback((id: string) => {
    setSelectedBlockIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedBlockIds(new Set(forecastBlocks.map(b => b.id)));
  }, [forecastBlocks]);

  const selectInboxOnly = useCallback(() => {
    setSelectedBlockIds(new Set(forecastBlocks.filter(b => b.source === "inbox_item").map(b => b.id)));
  }, [forecastBlocks]);

  const toggleInboxSelection = useCallback(() => {
    const inboxIds = forecastBlocks.filter(b => b.source === "inbox_item").map(b => b.id);
    setSelectedBlockIds(prev => {
      const allSelected = inboxIds.length > 0 && inboxIds.every(id => prev.has(id));
      if (allSelected) {
        // Deselect all inbox items
        const next = new Set(prev);
        inboxIds.forEach(id => next.delete(id));
        return next;
      } else {
        // Select only inbox items, deselect everything else
        return new Set(inboxIds);
      }
    });
  }, [forecastBlocks]);

  const deselectAll = useCallback(() => {
    setSelectedBlockIds(new Set());
  }, []);

  const generateForecast = useCallback(async (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => {
    const generationToken = ++generationTokenRef.current;
    setIsGenerating(true);

    try {
      const mode = modeOverride ?? planMode;
      const { data, error } = await supabase.functions.invoke("forecast-schedule", {
        body: { mode, weeklyCapacityHours },
      });

      if (generationToken !== generationTokenRef.current) return;

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Chyba", description: data.error, variant: "destructive" });
        return;
      }

      const rawBlocks: ForecastBlock[] = Array.isArray(data?.blocks) ? data.blocks : [];
      const blocks = rawBlocks.map(block => ({ ...block }));

      const weekSet = new Set(blocks.map(b => b.week));
      console.log(`[Forecast] Generated ${blocks.length} blocks across weeks:`, Array.from(weekSet).sort());
      console.log(`[Forecast] By source: existing_plan=${blocks.filter(b=>b.source==="existing_plan").length}, inbox_item=${blocks.filter(b=>b.source==="inbox_item").length}, project_estimate=${blocks.filter(b=>b.source==="project_estimate").length}`);

      setForecastBlocks(blocks);
      setSelectedBlockIds(new Set(blocks.filter(b => b.source === "inbox_item").map(b => b.id)));
      setSafetyNetProjects(Array.isArray(data?.safetyNet) ? data.safetyNet : []);

      if (blocks.length === 0) {
        toast({ title: "Forecast", description: "Žádné položky k naplánování." });
      } else {
        const inboxCount = blocks.filter(b => b.source === "inbox_item").length;
        const projectCount = blocks.filter(b => b.source === "project_estimate").length;
        toast({ title: "Forecast vygenerován", description: `${inboxCount} inbox + ${projectCount} projekt bloků naplánováno.` });
      }
    } catch (err: any) {
      if (generationToken !== generationTokenRef.current) return;
      console.error("Forecast error:", err);
      toast({ title: "Chyba forecastu", description: err.message || "Neznámá chyba", variant: "destructive" });
    } finally {
      if (generationToken === generationTokenRef.current) {
        setIsGenerating(false);
      }
    }
  }, [planMode]);

  const moveForecastBlock = useCallback((blockId: string, newWeek: string) => {
    setForecastBlocks(prev => prev.map(b => b.id === blockId ? { ...b, week: newWeek } : b));
  }, []);

  const removeForecastBlock = useCallback((blockId: string) => {
    setForecastBlocks(prev => {
      const block = prev.find(b => b.id === blockId);
      if (block && block.source === "project_estimate") {
        // Move to safety net instead of deleting
        setSafetyNetProjects(sn => {
          const existing = sn.find(p => p.project_id === block.project_id);
          if (existing) {
            // Aggregate hours into existing entry
            return sn.map(p => p.project_id === block.project_id
              ? { ...p, estimated_hours: p.estimated_hours + block.estimated_hours }
              : p
            );
          }
          return [...sn, {
            project_id: block.project_id,
            project_name: block.project_name,
            estimated_hours: block.estimated_hours,
            source: "unplanned" as const,
          }];
        });
        toast({ title: `🛡 ${block.project_name} přesunuto do Záchranné sítě` });
      }
      return prev.filter(b => b.id !== blockId);
    });
    setSelectedBlockIds(prev => {
      const next = new Set(prev);
      next.delete(blockId);
      return next;
    });
  }, []);

  const addForecastBlock = useCallback((block: ForecastBlock) => {
    setForecastBlocks(prev => [...prev, block]);
  }, []);

  const splitForecastBlock = useCallback((blockId: string, keepHours: number, splitWeek: string) => {
    setForecastBlocks(prev => {
      const block = prev.find(b => b.id === blockId);
      if (!block) return prev;
      const splitHours = block.estimated_hours - keepHours;
      if (splitHours <= 0 || keepHours <= 0) return prev;
      const newId = crypto.randomUUID();
      return prev.map(b => b.id === blockId ? { ...b, estimated_hours: keepHours } : b)
        .concat({
          ...block,
          id: newId,
          week: splitWeek,
          estimated_hours: splitHours,
          bundle_description: `${block.bundle_description} (část 2)`,
        });
    });
    // Auto-select the new block
    setSelectedBlockIds(prev => new Set(prev));
    toast({ title: "✂ Forecast blok rozdělen" });
  }, []);

  const resetAndRegenerate = useCallback(async (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => {
    const mode = modeOverride ?? planMode;
    clearStorage(mode);
    resetForecastState();
    await generateForecast(weeklyCapacityHours, mode);
  }, [planMode, resetForecastState, generateForecast]);

  // --- Real bundle override logic ---
  const addRealBundleOverride = useCallback((projectId: string, projectName: string, originalWeek: string, newWeek: string, hours: number, itemCount: number) => {
    setRealBundleOverrides(prev => {
      // Check if there's already an override for this project — update it or chain it
      const existing = prev.find(o => o.projectId === projectId && o.newWeek === originalWeek);
      if (existing) {
        // The bundle was already overridden to originalWeek; update its newWeek
        return prev.map(o => o === existing ? { ...o, newWeek } : o);
      }
      return [...prev, { projectId, projectName, originalWeek, newWeek, hours, itemCount }];
    });
    toast({ title: `📋 ${projectName} přesunut do nového týdne (forecast)` });
  }, []);

  const commitRealBundleOverrides = useCallback(async (moveBundleToWeek: (projectId: string, sourceWeek: string, targetWeek: string) => Promise<void>) => {
    if (realBundleOverrides.length === 0) return;
    try {
      for (const override of realBundleOverrides) {
        await moveBundleToWeek(override.projectId, override.originalWeek, override.newWeek);
      }
      toast({ title: `✅ ${realBundleOverrides.length} přesunů bundlů zapsáno` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [realBundleOverrides]);

  const commitBlocks = useCallback(async (blockIds?: string[]) => {
    if (!blockIds || blockIds.length === 0) return;
    const toCommit = forecastBlocks.filter(b => blockIds.includes(b.id));

    const committable = toCommit.filter(b => b.source === "inbox_item" || b.source === "project_estimate");

    if (committable.length === 0 && realBundleOverrides.length === 0) {
      toast({ title: "Žádné bloky k potvrzení" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "forecast-ai";

      // Fetch hourly rate from production_settings
      const { data: settings } = await supabase
        .from("production_settings")
        .select("hourly_rate")
        .limit(1)
        .single();
      const hourlyRate = Number(settings?.hourly_rate) || 550;

      // Separate inbox blocks from project estimate blocks
      const inboxBlocks = committable.filter(b => b.source === "inbox_item");
      const blockerBlocks = committable.filter(b => b.source === "project_estimate");

      // Collect all inbox item IDs from inbox blocks
      const allInboxItemIds: string[] = [];
      for (const block of inboxBlocks) {
        const ids = (block as any).inbox_item_ids;
        if (Array.isArray(ids)) allInboxItemIds.push(...ids);
      }

      // Fetch actual inbox items to create individual schedule rows
      let inboxRows: any[] = [];
      if (allInboxItemIds.length > 0) {
        const { data: inboxItems } = await supabase
          .from("production_inbox")
          .select("id, project_id, item_name, item_code, estimated_hours, estimated_czk, stage_id")
          .in("id", allInboxItemIds);

        if (inboxItems && inboxItems.length > 0) {
          // Group inbox items by project, then distribute across the weeks assigned to that project's blocks
          const inboxBlocksByProject = new Map<string, typeof inboxBlocks>();
          for (const block of inboxBlocks) {
            const pid = block.project_id;
            if (!inboxBlocksByProject.has(pid)) inboxBlocksByProject.set(pid, []);
            inboxBlocksByProject.get(pid)!.push(block);
          }

          for (const item of inboxItems) {
            // Find the first inbox block for this project to get the target week
            const projectBlocks = inboxBlocksByProject.get(item.project_id);
            const targetWeek = projectBlocks?.[0]?.week || inboxBlocks[0]?.week;

            inboxRows.push({
              project_id: item.project_id,
              item_name: item.item_name,
              item_code: item.item_code,
              stage_id: item.stage_id,
              inbox_item_id: item.id,
              scheduled_week: targetWeek,
              scheduled_hours: Number(item.estimated_hours) || 0,
              scheduled_czk: Number(item.estimated_czk) || 0,
              position: 999,
              status: "scheduled",
              created_by: userId,
              is_blocker: false,
            });
          }
        }
      }

      // Build blocker rows
      const blockerRows = blockerBlocks.map(block => ({
        project_id: block.project_id,
        item_name: `${block.project_name} — Rezerva kapacity`,
        scheduled_week: block.week,
        scheduled_hours: block.estimated_hours,
        scheduled_czk: 0,
        position: 999,
        status: "scheduled",
        created_by: userId,
        is_blocker: true,
        tpv_expected_date: block.tpv_expected_date || null,
      }));

      const allRows = [...inboxRows, ...blockerRows];

      // Single batch insert for ALL blocks
      if (allRows.length > 0) {
        const { error } = await supabase.from("production_schedule").insert(allRows as any);
        if (error) throw error;
      }

      // Mark inbox items as "scheduled"
      if (allInboxItemIds.length > 0) {
        const { error: inboxError } = await supabase
          .from("production_inbox")
          .update({ status: "scheduled" } as any)
          .in("id", allInboxItemIds);
        if (inboxError) console.error("Failed to update inbox status:", inboxError);
      }

      clearStorage(planMode);
      generationTokenRef.current += 1;
      setForecastActiveRaw(false);
      resetForecastState();

      // Invalidate only affected queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production-schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["production-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["production-progress"] }),
      ]);

      const desc = blockerRows.length > 0
        ? `Naplánováno ${inboxRows.length} položek · ${blockerRows.length} rezerv kapacity`
        : `${inboxRows.length} položek naplánováno`;
      toast({ title: `✅ ${desc}` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [forecastBlocks, selectedBlockIds, resetForecastState, planMode, realBundleOverrides, queryClient]);

  const commitInboxOnly = useCallback(async () => {
    const inboxBlocks = forecastBlocks.filter(b => b.source === "inbox_item" && selectedBlockIds.has(b.id));
    if (inboxBlocks.length === 0) {
      toast({ title: "Žádné inbox bloky k potvrzení" });
      return;
    }
    await commitBlocks(inboxBlocks.map(b => b.id));
  }, [forecastBlocks, selectedBlockIds, commitBlocks]);

  const restoreFromSafetyNet = useCallback((projectId: string) => {
    setSafetyNetProjects(prev => {
      const project = prev.find(p => p.project_id === projectId);
      if (!project) return prev;
      // Find the next available week (latest week in forecastBlocks + 1, or current week)
      const existingWeeks = forecastBlocks.map(b => b.week).sort();
      const targetWeek = existingWeeks.length > 0 ? existingWeeks[existingWeeks.length - 1] : new Date().toISOString().split("T")[0];
      const newBlock: ForecastBlock = {
        id: crypto.randomUUID(),
        project_id: project.project_id,
        project_name: project.project_name,
        bundle_description: `${project.project_name} — Rezerva kapacity`,
        week: targetWeek,
        estimated_hours: project.estimated_hours,
        confidence: "low",
        source: "project_estimate",
        is_forecast: true,
        selected: true,
      };
      setForecastBlocks(fb => [...fb, newBlock]);
      setSelectedBlockIds(sel => new Set(sel).add(newBlock.id));
      toast({ title: `🔄 ${project.project_name} vráceno do forecastu` });
      return prev.filter(p => p.project_id !== projectId);
    });
  }, [forecastBlocks]);

  const restoreToWeek = useCallback((projectId: string, targetWeek: string) => {
    setSafetyNetProjects(prev => {
      const project = prev.find(p => p.project_id === projectId);
      if (!project) return prev;
      const newBlock: ForecastBlock = {
        id: crypto.randomUUID(),
        project_id: project.project_id,
        project_name: project.project_name,
        bundle_description: `${project.project_name} — Rezerva kapacity`,
        week: targetWeek,
        estimated_hours: project.estimated_hours,
        confidence: "low",
        source: "project_estimate",
        is_forecast: true,
        selected: true,
      };
      setForecastBlocks(fb => [...fb, newBlock]);
      setSelectedBlockIds(sel => new Set(sel).add(newBlock.id));
      toast({ title: `🔄 ${project.project_name} → T${targetWeek.slice(5)}` });
      return prev.filter(p => p.project_id !== projectId);
    });
  }, []);

  return {
    forecastActive,
    setForecastActive,
    planMode,
    setPlanMode,
    forecastBlocks,
    isGenerating,
    selectedBlockIds,
    toggleBlockSelection,
    selectAll,
    selectInboxOnly,
    toggleInboxSelection,
    deselectAll,
    generateForecast,
    clearForecast,
    commitBlocks,
    commitInboxOnly,
    moveForecastBlock,
    removeForecastBlock,
    addForecastBlock,
    splitForecastBlock,
    resetAndRegenerate,
    loadSavedSession,
    realBundleOverrides,
    addRealBundleOverride,
    commitRealBundleOverrides,
    safetyNetProjects,
    restoreFromSafetyNet,
    restoreToWeek,
  };
}
