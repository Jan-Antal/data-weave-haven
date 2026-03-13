import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

function saveToStorage(mode: ForecastPlanMode, blocks: ForecastBlock[], selectedIds: Set<string>, overrides: RealBundleOverride[]) {
  try {
    localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify({
      blocks,
      selectedBlockIds: Array.from(selectedIds),
      realBundleOverrides: overrides,
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

function loadFromStorage(mode: ForecastPlanMode): { blocks: ForecastBlock[]; selectedIds: Set<string>; overrides: RealBundleOverride[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[mode]);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.blocks) || data.blocks.length === 0) return null;
    return {
      blocks: data.blocks,
      selectedIds: new Set<string>(data.selectedBlockIds || []),
      overrides: Array.isArray(data.realBundleOverrides) ? data.realBundleOverrides : [],
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
  deselectAll: () => void;
  generateForecast: (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => Promise<void>;
  clearForecast: () => void;
  commitBlocks: (blockIds?: string[]) => Promise<void>;
  commitInboxOnly: () => Promise<void>;
  moveForecastBlock: (blockId: string, newWeek: string) => void;
  removeForecastBlock: (blockId: string) => void;
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
}

export function useForecastMode(): UseForecastModeReturn {
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
      saveToStorage(planMode, forecastBlocks, selectedBlockIds, realBundleOverrides);
    }
  }, [forecastBlocks, selectedBlockIds, planMode, forecastActive, realBundleOverrides]);

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
      setSelectedBlockIds(new Set(blocks.map(b => b.id)));
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
          // Avoid duplicates
          if (sn.some(p => p.project_id === block.project_id)) return sn;
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
    const toCommit = blockIds
      ? forecastBlocks.filter(b => blockIds.includes(b.id))
      : forecastBlocks.filter(b => selectedBlockIds.has(b.id));

    const committable = toCommit.filter(b => b.source === "inbox_item" || b.source === "project_estimate");

    if (committable.length === 0 && realBundleOverrides.length === 0) {
      toast({ title: "Žádné bloky k potvrzení" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "forecast-ai";
      const hourlyRate = 550;

      let blockerCount = 0;
      let normalCount = 0;

      for (const block of committable) {
        const isBlocker = block.source === "project_estimate";
        if (isBlocker) blockerCount++;
        else normalCount++;

        const { error } = await supabase.from("production_schedule").insert({
          project_id: block.project_id,
          item_name: isBlocker
            ? `${block.project_name} — Rezerva kapacity`
            : block.bundle_description,
          scheduled_week: block.week,
          scheduled_hours: block.estimated_hours,
          scheduled_czk: isBlocker ? 0 : block.estimated_hours * hourlyRate,
          position: 999,
          status: "scheduled",
          created_by: userId,
          is_blocker: isBlocker,
          tpv_expected_date: isBlocker ? (block.tpv_expected_date || null) : null,
        } as any);
        if (error) throw error;
      }

      clearStorage(planMode);
      generationTokenRef.current += 1;
      setForecastActiveRaw(false);
      resetForecastState();

      const desc = blockerCount > 0
        ? `Naplánováno ${normalCount} projektů · ${blockerCount} rezerv kapacity`
        : `${committable.length} bloků naplánováno`;
      toast({ title: `✅ ${desc}` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [forecastBlocks, selectedBlockIds, resetForecastState, planMode, realBundleOverrides]);

  const commitInboxOnly = useCallback(async () => {
    const inboxBlocks = forecastBlocks.filter(b => b.source === "inbox_item" && selectedBlockIds.has(b.id));
    if (inboxBlocks.length === 0) {
      toast({ title: "Žádné inbox bloky k potvrzení" });
      return;
    }
    await commitBlocks(inboxBlocks.map(b => b.id));
  }, [forecastBlocks, selectedBlockIds, commitBlocks]);

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
    deselectAll,
    generateForecast,
    clearForecast,
    commitBlocks,
    commitInboxOnly,
    moveForecastBlock,
    removeForecastBlock,
    splitForecastBlock,
    resetAndRegenerate,
    loadSavedSession,
    realBundleOverrides,
    addRealBundleOverride,
    commitRealBundleOverrides,
    safetyNetProjects,
  };
}
