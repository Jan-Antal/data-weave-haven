import { useState, useCallback, useMemo, useEffect } from "react";
import type { WeekSilo } from "@/hooks/useProductionSchedule";
import type { ForecastBlock } from "@/hooks/useForecastMode";

export interface SearchMatch {
  weekKey: string;
  projectId: string;
  matchKey: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface UseSearchNavigationOptions {
  query: string;
  scheduleData: Map<string, WeekSilo> | undefined;
  forecastBlocks?: ForecastBlock[];
  forecastActive?: boolean;
  forecastPlanMode?: "respect_plan" | "from_scratch";
  weekKeys: string[];
}

export function useSearchNavigation({
  query,
  scheduleData,
  forecastBlocks,
  forecastActive,
  forecastPlanMode,
  weekKeys,
}: UseSearchNavigationOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const trimmed = query.trim();
  const active = trimmed.length >= 3;
  const nq = active ? normalize(trimmed) : "";

  const { matches, matchedProjectIds } = useMemo(() => {
    if (!active)
      return { matches: [] as SearchMatch[], matchedProjectIds: new Set<string>() };

    const result: SearchMatch[] = [];
    const matched = new Set<string>();
    const seen = new Set<string>();
    const hideReal = forecastActive && forecastPlanMode === "from_scratch";

    for (const weekKey of weekKeys) {
      // Real schedule bundles
      if (!hideReal && scheduleData) {
        const silo = scheduleData.get(weekKey);
        if (silo) {
          for (const bundle of silo.bundles) {
            const texts = [
              bundle.project_name,
              bundle.project_id,
              ...bundle.items.map((i) => i.item_name),
              ...bundle.items.map((i) => i.item_code ?? ""),
            ];
            if (texts.some((t) => t && normalize(t).includes(nq))) {
              const key = `${weekKey}::${bundle.project_id}`;
              if (!seen.has(key)) {
                seen.add(key);
                result.push({ weekKey, projectId: bundle.project_id, matchKey: key });
                matched.add(bundle.project_id);
              }
            }
          }
        }
      }

      // Forecast blocks
      if (forecastActive && forecastBlocks) {
        for (const block of forecastBlocks) {
          if (block.week !== weekKey) continue;
          const texts = [
            block.project_name,
            block.project_id,
            block.bundle_description ?? "",
          ];
          if (texts.some((t) => t && normalize(t).includes(nq))) {
            const key = `${weekKey}::${block.project_id}`;
            if (!seen.has(key)) {
              seen.add(key);
              result.push({ weekKey, projectId: block.project_id, matchKey: key });
              matched.add(block.project_id);
            }
          }
        }
      }
    }

    return { matches: result, matchedProjectIds: matched };
  }, [active, nq, scheduleData, forecastBlocks, forecastActive, forecastPlanMode, weekKeys]);

  // Reset index when query changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [nq]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const currentMatch = matches[currentIndex] ?? null;
  const focusedMatchKey = currentMatch?.matchKey ?? null;

  return {
    matches,
    currentIndex,
    currentMatch,
    focusedMatchKey,
    matchedProjectIds,
    totalCount: matches.length,
    active,
    goNext,
    goPrev,
  };
}
