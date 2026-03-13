import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type ForecastConfidence = "high" | "medium" | "low";
export type ForecastSource = "existing_plan" | "ai_generated";
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
      // Clear everything on deactivation
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
        toast({ title: "Forecast vygenerován", description: `${blocks.length} bloků naplánováno.` });
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

    if (toCommit.length === 0) {
      toast({ title: "Žádné bloky k potvrzení" });
      return;
    }

    try {
      // Insert each forecast block as a production_inbox item
      for (const block of toCommit) {
        const { error } = await supabase.from("production_inbox").insert({
          project_id: block.project_id,
          item_name: block.bundle_description,
          estimated_hours: block.estimated_hours,
          estimated_czk: block.estimated_hours * 550,
          sent_by: "forecast-ai",
          status: "pending",
        });
        if (error) throw error;
      }

      toast({ title: `✅ ${toCommit.length} bloků přidáno do Inboxu` });
      
      // Remove committed blocks
      setForecastBlocks(prev => prev.filter(b => !toCommit.find(c => c.id === b.id)));
      setSelectedBlockIds(prev => {
        const next = new Set(prev);
        toCommit.forEach(b => next.delete(b.id));
        return next;
      });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [forecastBlocks, selectedBlockIds]);

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
  };
}
