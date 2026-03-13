import { useState, useCallback } from "react";
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
  generateForecast: (weeklyCapacityHours: number) => Promise<void>;
  clearForecast: () => void;
  commitBlocks: (blockIds?: string[]) => Promise<void>;
  commitInboxOnly: () => Promise<void>;
}

export function useForecastMode(): UseForecastModeReturn {
  const [forecastActive, setForecastActiveRaw] = useState(false);
  const [planMode, setPlanMode] = useState<ForecastPlanMode>("respect_plan");
  const [forecastBlocks, setForecastBlocks] = useState<ForecastBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

  const setForecastActive = useCallback((v: boolean) => {
    setForecastActiveRaw(v);
    if (!v) {
      setForecastBlocks([]);
      setSelectedBlockIds(new Set());
    }
  }, []);

  const clearForecast = useCallback(() => {
    setForecastBlocks([]);
    setSelectedBlockIds(new Set());
  }, []);

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

  const generateForecast = useCallback(async (weeklyCapacityHours: number) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("forecast-schedule", {
        body: { mode: planMode, weeklyCapacityHours },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Chyba", description: data.error, variant: "destructive" });
        return;
      }

      const blocks: ForecastBlock[] = data?.blocks || [];
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
      console.error("Forecast error:", err);
      toast({ title: "Chyba forecastu", description: err.message || "Neznámá chyba", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [planMode]);

  const commitBlocks = useCallback(async (blockIds?: string[]) => {
    const toCommit = blockIds
      ? forecastBlocks.filter(b => blockIds.includes(b.id))
      : forecastBlocks.filter(b => selectedBlockIds.has(b.id));

    // Only commit inbox_item and project_estimate blocks (never existing_plan)
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
        // Create actual production_schedule entries in the target week
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

      toast({ title: `✅ ${committable.length} bloků naplánováno` });
      
      // Remove committed blocks from forecast state
      setForecastBlocks(prev => prev.filter(b => !committable.find(c => c.id === b.id)));
      setSelectedBlockIds(prev => {
        const next = new Set(prev);
        committable.forEach(b => next.delete(b.id));
        return next;
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [forecastBlocks, selectedBlockIds]);

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
  };
}
