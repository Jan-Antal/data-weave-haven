import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  confidence: ForecastConfidence;
  source: ForecastSource;
  is_forecast: true;
  selected?: boolean;
}

const STORAGE_KEYS: Record<ForecastPlanMode, string> = {
  respect_plan: "ami_forecast_session",
  from_scratch: "ami_forecast_session_scratch",
};

function saveToStorage(mode: ForecastPlanMode, blocks: ForecastBlock[], selectedIds: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify({
      blocks,
      selectedBlockIds: Array.from(selectedIds),
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

function loadFromStorage(mode: ForecastPlanMode): { blocks: ForecastBlock[]; selectedIds: Set<string> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[mode]);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.blocks) || data.blocks.length === 0) return null;
    return {
      blocks: data.blocks,
      selectedIds: new Set<string>(data.selectedBlockIds || []),
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
  resetAndRegenerate: (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => Promise<void>;
  loadSavedSession: (modeOverride?: ForecastPlanMode) => boolean;
}

export function useForecastMode(): UseForecastModeReturn {
  const [forecastActive, setForecastActiveRaw] = useState(false);
  const [planMode, setPlanModeRaw] = useState<ForecastPlanMode>("respect_plan");
  const [forecastBlocks, setForecastBlocks] = useState<ForecastBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const generationTokenRef = useRef(0);

  // Persist to localStorage whenever blocks or selection changes
  useEffect(() => {
    if (forecastActive && forecastBlocks.length > 0) {
      saveToStorage(planMode, forecastBlocks, selectedBlockIds);
    }
  }, [forecastBlocks, selectedBlockIds, planMode, forecastActive]);

  const resetForecastState = useCallback(() => {
    setForecastBlocks([]);
    setSelectedBlockIds(new Set());
    setIsGenerating(false);
  }, []);

  const loadSavedSession = useCallback((modeOverride?: ForecastPlanMode): boolean => {
    const mode = modeOverride ?? planMode;
    const saved = loadFromStorage(mode);
    if (saved) {
      setForecastBlocks(saved.blocks);
      setSelectedBlockIds(saved.selectedIds);
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
      // Keep localStorage intact so it loads next time
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
      setForecastBlocks(blocks);
      setSelectedBlockIds(new Set(blocks.map(b => b.id)));

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
    setForecastBlocks(prev => prev.filter(b => b.id !== blockId));
    setSelectedBlockIds(prev => {
      const next = new Set(prev);
      next.delete(blockId);
      return next;
    });
  }, []);

  const resetAndRegenerate = useCallback(async (weeklyCapacityHours: number, modeOverride?: ForecastPlanMode) => {
    const mode = modeOverride ?? planMode;
    clearStorage(mode);
    resetForecastState();
    await generateForecast(weeklyCapacityHours, mode);
  }, [planMode, resetForecastState, generateForecast]);

  const commitBlocks = useCallback(async (blockIds?: string[]) => {
    const toCommit = blockIds
      ? forecastBlocks.filter(b => blockIds.includes(b.id))
      : forecastBlocks.filter(b => selectedBlockIds.has(b.id));

    const committable = toCommit.filter(b => b.source === "inbox_item" || b.source === "project_estimate");

    if (committable.length === 0) {
      toast({ title: "Žádné bloky k potvrzení" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "forecast-ai";
      const hourlyRate = 550;

      for (const block of committable) {
        const { error } = await supabase.from("production_schedule").insert({
          project_id: block.project_id,
          item_name: block.bundle_description,
          scheduled_week: block.week,
          scheduled_hours: block.estimated_hours,
          scheduled_czk: block.estimated_hours * hourlyRate,
          position: 999,
          status: "scheduled",
          created_by: userId,
        });
        if (error) throw error;
      }

      // Clear localStorage for this mode on commit
      clearStorage(planMode);
      generationTokenRef.current += 1;
      setForecastActiveRaw(false);
      resetForecastState();
      toast({ title: `✅ ${committable.length} bloků naplánováno` });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [forecastBlocks, selectedBlockIds, resetForecastState, planMode]);

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
    resetAndRegenerate,
    loadSavedSession,
  };
}
