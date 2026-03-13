import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { WeekSilo } from "@/hooks/useProductionSchedule";
import type { ForecastBlock } from "@/hooks/useForecastMode";

export interface SearchMatch {
  weekKey: string;
  projectId: string;
  /** unique key for focused highlight */
  matchKey: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchesQuery(bundle: { project_name: string; project_id: string; items: Array<{ item_name?: string; item_code?: string | null }> }, q: string, pm?: string | null): boolean {
  const nq = normalize(q);
  if (normalize(bundle.project_name).includes(nq)) return true;
  if (normalize(bundle.project_id).includes(nq)) return true;
  if (pm && normalize(pm).includes(nq)) return true;
  for (const i of bundle.items) {
    if (i.item_name && normalize(i.item_name).includes(nq)) return true;
    if (i.item_code && normalize(i.item_code).includes(nq)) return true;
  }
  return false;
}

interface UseSearchNavigationOptions {
  query: string;
  scheduleData: Map<string, WeekSilo> | undefined;
  forecastBlocks?: ForecastBlock[];
  forecastActive?: boolean;
  forecastPlanMode?: "respect_plan" | "from_scratch";
  weekKeys: string[];
  projectPmMap?: Map<string, string | null>;
}

export function useSearchNavigation({ query, scheduleData, forecastBlocks, forecastActive, forecastPlanMode, weekKeys }: UseSearchNavigationOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusedMatchKey, setFocusedMatchKey] = useState<string | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const matches = useMemo<SearchMatch[]>(() => {
    if (!query.trim()) return [];
    const result: SearchMatch[] = [];
    const hideReal = forecastActive && forecastPlanMode === "from_scratch";

    for (const weekKey of weekKeys) {
      // Real bundles
      if (!hideReal && scheduleData) {
        const silo = scheduleData.get(weekKey);
        if (silo) {
          for (const bundle of silo.bundles) {
            if (matchesQuery(bundle, query)) {
              result.push({ weekKey, projectId: bundle.project_id, matchKey: `${weekKey}::${bundle.project_id}` });
            }
          }
        }
      }
      // Forecast blocks
      if (forecastActive && forecastBlocks) {
        for (const block of forecastBlocks) {
          if (block.week !== weekKey) continue;
          const fakeBundle = {
            project_name: block.project_name,
            project_id: block.project_id,
            items: [{ item_name: block.bundle_description }],
          };
          if (matchesQuery(fakeBundle, query)) {
            // Avoid duplicate if real bundle already matched same project in same week
            const key = `${weekKey}::${block.project_id}`;
            if (!result.some(m => m.matchKey === key)) {
              result.push({ weekKey, projectId: block.project_id, matchKey: key });
            }
          }
        }
      }
    }
    return result;
  }, [query, scheduleData, forecastBlocks, forecastActive, forecastPlanMode, weekKeys]);

  // Reset index when matches change
  useEffect(() => {
    setCurrentIndex(0);
    setFocusedMatchKey(null);
  }, [matches.length, query]);

  // Cleanup
  useEffect(() => () => clearTimeout(fadeTimerRef.current), []);

  const triggerFocus = useCallback((index: number) => {
    const match = matches[index];
    if (!match) return;
    setCurrentIndex(index);
    setFocusedMatchKey(match.matchKey);
    clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => setFocusedMatchKey(null), 1500);
  }, [matches]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    triggerFocus(next);
  }, [currentIndex, matches.length, triggerFocus]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    triggerFocus(prev);
  }, [currentIndex, matches.length, triggerFocus]);

  const currentMatch = matches[currentIndex] ?? null;

  return {
    matches,
    currentIndex,
    currentMatch,
    focusedMatchKey,
    totalCount: matches.length,
    goNext,
    goPrev,
  };
}
