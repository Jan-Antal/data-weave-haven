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

function matchesQuery(text: string[], q: string): boolean {
  const nq = normalize(q);
  return text.some(t => t && normalize(t).includes(nq));
}

interface InboxProject {
  project_id: string;
  project_name: string;
  items: Array<{ item_code?: string | null }>;
}

interface UseSearchNavigationOptions {
  query: string;
  scheduleData: Map<string, WeekSilo> | undefined;
  forecastBlocks?: ForecastBlock[];
  forecastActive?: boolean;
  forecastPlanMode?: "respect_plan" | "from_scratch";
  weekKeys: string[];
  projectPmMap?: Map<string, string | null>;
  inboxProjects?: InboxProject[];
}

export function useSearchNavigation({ query, scheduleData, forecastBlocks, forecastActive, forecastPlanMode, weekKeys, projectPmMap, inboxProjects }: UseSearchNavigationOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusedMatchKey, setFocusedMatchKey] = useState<string | null>(null);

  // Count unique matched projects across all sources
  const matchedProjectIds = useMemo<Set<string>>(() => {
    if (!query.trim()) return new Set();
    const matched = new Set<string>();

    const check = (projectId: string, projectName: string, extraTexts: string[] = []) => {
      const pm = projectPmMap?.get(projectId) ?? "";
      if (matchesQuery([projectName, projectId, pm, ...extraTexts], query)) {
        matched.add(projectId);
      }
    };

    // Schedule (Week Silos only)
    if (scheduleData) {
      for (const [, silo] of scheduleData) {
        for (const bundle of silo.bundles) {
          const codes = bundle.items.map(i => i.item_code ?? "");
          check(bundle.project_id, bundle.project_name, codes);
        }
      }
    }

    // Forecast
    if (forecastActive && forecastBlocks) {
      for (const block of forecastBlocks) {
        check(block.project_id, block.project_name, [block.bundle_description ?? ""]);
      }
    }

    return matched;
  }, [query, scheduleData, forecastBlocks, forecastActive, projectPmMap]);

  // Navigation matches (week-based, for prev/next arrows)
  const matches = useMemo<SearchMatch[]>(() => {
    if (!query.trim()) return [];
    const result: SearchMatch[] = [];
    const hideReal = forecastActive && forecastPlanMode === "from_scratch";

    for (const weekKey of weekKeys) {
      if (!hideReal && scheduleData) {
        const silo = scheduleData.get(weekKey);
        if (silo) {
          for (const bundle of silo.bundles) {
            if (matchedProjectIds.has(bundle.project_id)) {
              result.push({ weekKey, projectId: bundle.project_id, matchKey: `${weekKey}::${bundle.project_id}` });
            }
          }
        }
      }
      if (forecastActive && forecastBlocks) {
        for (const block of forecastBlocks) {
          if (block.week !== weekKey) continue;
          if (matchedProjectIds.has(block.project_id)) {
            const key = `${weekKey}::${block.project_id}`;
            if (!result.some(m => m.matchKey === key)) {
              result.push({ weekKey, projectId: block.project_id, matchKey: key });
            }
          }
        }
      }
    }
    return result;
  }, [query, scheduleData, forecastBlocks, forecastActive, forecastPlanMode, weekKeys, matchedProjectIds]);

  useEffect(() => {
    setCurrentIndex(0);
    setFocusedMatchKey(null);
  }, [matches.length, query]);

  const triggerFocus = useCallback((index: number) => {
    const match = matches[index];
    if (!match) return;
    setCurrentIndex(index);
    setFocusedMatchKey(match.matchKey);
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
    totalCount: matchedProjectIds.size,
    goNext,
    goPrev,
  };
}
