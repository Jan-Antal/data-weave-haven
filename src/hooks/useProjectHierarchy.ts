import { useState, useMemo, useEffect, useCallback } from "react";

/**
 * Detects parent-child project relationships based on project IDs.
 * A child has parentId + "-" + short alpha suffix (1-3 letters).
 * E.g. Z-2501-002-R is child of Z-2501-002, but Z-2501-002 is NOT child of Z-2501.
 */

// Check if suffix is a short alpha string (1-3 letters) — subproject indicator
const SUFFIX_RE = /^[A-Za-z]{1,3}$/;

export interface HierarchyRow<T> {
  row: T;
  isChild: boolean;
  isParent: boolean;
  parentProjectId: string | null;
  childCount: number;
  /** true when parent is visible only because a child matched filters */
  visibleViaChild: boolean;
  /** true when this child matched the active filter */
  matchesFilter: boolean;
}

export function buildParentChildMap<T extends { project_id: string }>(
  allProjects: T[]
): { parentOf: Map<string, string>; childrenOf: Map<string, string[]> } {
  const ids = new Set(allProjects.map((p) => p.project_id));
  const parentOf = new Map<string, string>(); // childId -> parentId
  const childrenOf = new Map<string, string[]>(); // parentId -> childIds

  for (const p of allProjects) {
    const pid = p.project_id;
    const lastDash = pid.lastIndexOf("-");
    if (lastDash === -1) continue;
    const possibleParent = pid.substring(0, lastDash);
    const suffix = pid.substring(lastDash + 1);
    if (SUFFIX_RE.test(suffix) && ids.has(possibleParent)) {
      parentOf.set(pid, possibleParent);
      if (!childrenOf.has(possibleParent)) childrenOf.set(possibleParent, []);
      childrenOf.get(possibleParent)!.push(pid);
    }
  }

  return { parentOf, childrenOf };
}

interface FilterParams {
  personFilter?: string | null;
  statusFilter?: string[];
  search?: string;
}

/** Check if a single row matches the given filters */
function rowMatchesFilters<T extends Record<string, any>>(row: T, filters: FilterParams): boolean {
  // Person filter
  if (filters.personFilter) {
    const person = filters.personFilter;
    const match = [row.pm, row.konstrukter, row.kalkulant].some(
      (v) => v && String(v).includes(person)
    );
    if (!match) return false;
  }

  // Status filter
  if (filters.statusFilter !== undefined) {
    if (filters.statusFilter.length === 0) return false;
    const status = row.status;
    if (!status || !filters.statusFilter.includes(status)) return false;
  }

  // Search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const match = Object.values(row).some(
      (v) => v != null && String(v).toLowerCase().includes(q)
    );
    if (!match) return false;
  }

  return true;
}

export function useProjectHierarchy<T extends Record<string, any> & { project_id: string }>(
  allProjects: T[],
  sortedFiltered: T[],
  filters: FilterParams
) {
  const { parentOf, childrenOf } = useMemo(
    () => buildParentChildMap(allProjects),
    [allProjects]
  );

  const hasActiveFilters = useMemo(() => {
    return !!(filters.personFilter || filters.search || (filters.statusFilter && filters.statusFilter.length < 100));
  }, [filters]);

  // Track which parents should auto-expand because a child matches
  const autoExpandedParents = useMemo(() => {
    if (!hasActiveFilters) return new Set<string>();
    const set = new Set<string>();
    const byId = new Map(allProjects.map((p) => [p.project_id, p]));

    for (const [parentId, childIds] of childrenOf.entries()) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      const parentMatches = rowMatchesFilters(parent, filters);
      if (parentMatches) continue; // parent matches on its own, no auto-expand needed

      const anyChildMatches = childIds.some((cid) => {
        const child = byId.get(cid);
        return child && rowMatchesFilters(child, filters);
      });
      if (anyChildMatches) set.add(parentId);
    }
    return set;
  }, [allProjects, childrenOf, filters, hasActiveFilters]);

  // Manual expand/collapse state
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());

  // Reset expand state when filters change
  useEffect(() => {
    setManualExpanded(new Set());
  }, [filters.personFilter, filters.statusFilter, filters.search]);

  const toggleExpand = useCallback((projectId: string) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (projectId: string) => {
      // If auto-expanded due to filter, and user hasn't manually collapsed it
      if (autoExpandedParents.has(projectId) && !manualExpanded.has(projectId)) return true;
      // If manually toggled
      if (manualExpanded.has(projectId)) {
        // Toggle: if auto-expanded, manual means collapse; otherwise means expand
        return !autoExpandedParents.has(projectId);
      }
      return false;
    },
    [autoExpandedParents, manualExpanded]
  );

  // Build the hierarchical rows list from sorted/filtered data
  const hierarchicalRows = useMemo(() => {
    const sortedIds = new Set(sortedFiltered.map((p) => p.project_id));
    const byId = new Map(allProjects.map((p) => [p.project_id, p]));
    const result: HierarchyRow<T>[] = [];
    const processedChildren = new Set<string>();

    for (const p of sortedFiltered) {
      const pid = p.project_id;

      // Skip if this is a child — children are rendered under their parent
      if (parentOf.has(pid)) {
        // Only show as standalone if parent doesn't exist in data
        if (byId.has(parentOf.get(pid)!)) continue;
      }

      const isParent = childrenOf.has(pid);
      const visibleViaChild = autoExpandedParents.has(pid) && !sortedIds.has(pid);

      result.push({
        row: p,
        isChild: false,
        isParent,
        parentProjectId: null,
        childCount: childrenOf.get(pid)?.length ?? 0,
        visibleViaChild: false,
        matchesFilter: true,
      });

      // Show children if expanded
      if (isParent && isExpanded(pid)) {
        const children = childrenOf.get(pid) ?? [];
        for (const cid of children) {
          const child = byId.get(cid);
          if (!child) continue;
          processedChildren.add(cid);
          const childMatches = !hasActiveFilters || rowMatchesFilters(child, filters);
          // In filter mode, hide non-matching children
          if (hasActiveFilters && !childMatches) continue;
          result.push({
            row: child,
            isChild: true,
            isParent: false,
            parentProjectId: pid,
            childCount: 0,
            visibleViaChild: false,
            matchesFilter: childMatches,
          });
        }
      }
    }

    // Also add parents that are only visible because children match
    // (they weren't in sortedFiltered because they didn't match filters themselves)
    for (const parentId of autoExpandedParents) {
      const parent = byId.get(parentId);
      if (!parent || sortedIds.has(parentId)) continue;

      result.push({
        row: parent,
        isChild: false,
        isParent: true,
        parentProjectId: null,
        childCount: childrenOf.get(parentId)?.length ?? 0,
        visibleViaChild: true,
        matchesFilter: false,
      });

      if (isExpanded(parentId)) {
        const children = childrenOf.get(parentId) ?? [];
        for (const cid of children) {
          const child = byId.get(cid);
          if (!child) continue;
          const childMatches = rowMatchesFilters(child, filters);
          if (!childMatches) continue;
          result.push({
            row: child,
            isChild: true,
            isParent: false,
            parentProjectId: parentId,
            childCount: 0,
            visibleViaChild: false,
            matchesFilter: true,
          });
        }
      }
    }

    return result;
  }, [sortedFiltered, allProjects, parentOf, childrenOf, autoExpandedParents, isExpanded, hasActiveFilters, filters]);

  // Filter out standalone child rows from sorted (children should only appear under parents)
  const filteredSorted = useMemo(() => {
    return sortedFiltered.filter((p) => {
      if (parentOf.has(p.project_id)) {
        const parent = parentOf.get(p.project_id)!;
        // If parent exists in data, don't show child as standalone
        return !allProjects.some((ap) => ap.project_id === parent);
      }
      return true;
    });
  }, [sortedFiltered, parentOf, allProjects]);

  return {
    hierarchicalRows,
    parentOf,
    childrenOf,
    toggleExpand,
    isExpanded,
    autoExpandedParents,
  };
}
