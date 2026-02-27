import { useState, useMemo } from "react";

type SortDir = "asc" | "desc" | null;

interface ExternalFilters {
  personFilter?: string | null;
  statusFilter?: string[];
}

export interface HierarchyInfo {
  isChild: boolean;
  parentId?: string;
  /** Number of child matches that caused this parent to be included */
  childMatchCount?: number;
}

/**
 * Detect parent-child relationships by project_id pattern.
 * A child ID = parentID + "-" + short suffix (1-3 alphanumeric chars).
 */
function buildHierarchy<T extends Record<string, any>>(data: T[]): {
  parentMap: Map<string, string>; // childProjectId -> parentProjectId
  childrenMap: Map<string, string[]>; // parentProjectId -> childProjectIds[]
} {
  const allIds = new Set(data.map((r) => r.project_id as string));
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();

  for (const id of allIds) {
    // Try to find a parent: strip last segment after "-" and check if it's 1-3 chars
    const lastDash = id.lastIndexOf("-");
    if (lastDash === -1) continue;
    const suffix = id.substring(lastDash + 1);
    if (suffix.length < 1 || suffix.length > 3) continue;
    // Suffix should be alphanumeric (letter or letter+number pattern)
    if (!/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(suffix)) continue;
    const potentialParent = id.substring(0, lastDash);
    if (allIds.has(potentialParent)) {
      parentMap.set(id, potentialParent);
      if (!childrenMap.has(potentialParent)) childrenMap.set(potentialParent, []);
      childrenMap.get(potentialParent)!.push(id);
    }
  }

  return { parentMap, childrenMap };
}

export function useSortFilter<T extends Record<string, any>>(data: T[], externalFilters?: ExternalFilters, externalSearch?: string) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [internalSearch, setInternalSearch] = useState("");
  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch = setInternalSearch;

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const { parentMap, childrenMap } = useMemo(() => buildHierarchy(data), [data]);

  const filtered = useMemo(() => {
    let result = data;

    // Person filter
    if (externalFilters?.personFilter) {
      const person = externalFilters.personFilter;
      result = result.filter(row =>
        [row.pm, row.konstrukter, row.kalkulant].some(
          (v) => v && String(v).includes(person)
        )
      );
    }

    // Status filter
    if (externalFilters?.statusFilter && externalFilters.statusFilter.length > 0) {
      const allowed = externalFilters.statusFilter;
      result = result.filter(row => {
        const status = row.status;
        if (!status) return false;
        return allowed.includes(status);
      });
    } else if (externalFilters?.statusFilter && externalFilters.statusFilter.length === 0) {
      result = [];
    }

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(v => v != null && String(v).toLowerCase().includes(q))
      );
    }

    return result;
  }, [data, search, externalFilters?.personFilter, externalFilters?.statusFilter]);

  // Smart hierarchy filtering: include parents if their children match
  const { smartFiltered, hierarchyInfoMap } = useMemo(() => {
    const filteredIds = new Set(filtered.map((r) => r.project_id as string));
    const infoMap = new Map<string, HierarchyInfo>();
    const extraParentIds = new Set<string>();

    // Step 1: Find matching subprojects and pull in their parents
    for (const row of filtered) {
      const pid = row.project_id as string;
      const parentId = parentMap.get(pid);
      if (parentId) {
        infoMap.set(pid, { isChild: true, parentId });
        if (!filteredIds.has(parentId)) {
          extraParentIds.add(parentId);
        }
      }
    }

    if (extraParentIds.size > 0) {
      console.log("[SmartFilter] Subprojects matched filter, pulling in parents:", {
        matchingSubprojects: [...filteredIds].filter(id => parentMap.has(id)),
        parentsAddedBySubprojects: [...extraParentIds],
      });
    }

    // Step 2: Count child matches for parents
    for (const [parentId, children] of childrenMap) {
      const matchingChildren = children.filter((cid) => filteredIds.has(cid));
      if (matchingChildren.length > 0) {
        const parentInFilter = filteredIds.has(parentId);
        infoMap.set(parentId, {
          isChild: false,
          childMatchCount: parentInFilter ? undefined : matchingChildren.length,
        });
      }
    }

    // Mark children whose parent is also in filtered
    for (const row of filtered) {
      const pid = row.project_id as string;
      if (parentMap.has(pid) && !infoMap.has(pid)) {
        infoMap.set(pid, { isChild: true, parentId: parentMap.get(pid) });
      }
    }

    // Step 3: Build final list: filtered + extra parents
    let finalResult: T[];
    if (extraParentIds.size > 0) {
      const extraParents = data.filter((r) => extraParentIds.has(r.project_id as string));
      finalResult = [...filtered, ...extraParents];
    } else {
      finalResult = filtered;
    }

    console.log("[SmartFilter] Hierarchy map:", [...parentMap.entries()].slice(0, 10), "Children map:", [...childrenMap.entries()].slice(0, 10));
    console.log("[SmartFilter] Result:", finalResult.length, "rows (filtered:", filtered.length, "+ extra parents:", extraParentIds.size, ")");

    return { smartFiltered: finalResult, hierarchyInfoMap: infoMap };
  }, [filtered, data, parentMap, childrenMap]);

  const sorted = useMemo(() => {
    let items = [...smartFiltered];

    // Sort
    if (sortCol && sortDir) {
      items.sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        const numA = Number(av);
        const numB = Number(bv);
        if (!isNaN(numA) && !isNaN(numB) && av !== "" && bv !== "") {
          return sortDir === "asc" ? numA - numB : numB - numA;
        }
        const cmp = String(av).localeCompare(String(bv), "cs");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    // Re-order so children come right after their parent
    const ordered: T[] = [];
    const placed = new Set<string>();

    for (const item of items) {
      const pid = item.project_id as string;
      if (placed.has(pid)) continue;

      // If this is a child and its parent hasn't been placed yet, skip (parent will pull it)
      if (parentMap.has(pid)) continue;

      // Place this item
      ordered.push(item);
      placed.add(pid);

      // Place its children that are in the list
      if (childrenMap.has(pid)) {
        const childIds = childrenMap.get(pid)!;
        for (const ci of childIds) {
          if (!placed.has(ci)) {
            const childRow = items.find((r) => r.project_id === ci);
            if (childRow) {
              ordered.push(childRow);
              placed.add(ci);
            }
          }
        }
      }
    }

    // Add any remaining children whose parents were not in the list
    for (const item of items) {
      if (!placed.has(item.project_id as string)) {
        ordered.push(item);
        placed.add(item.project_id as string);
      }
    }

    return ordered;
  }, [smartFiltered, sortCol, sortDir, parentMap, childrenMap]);

  return { sorted, search, setSearch, sortCol, sortDir, toggleSort, hierarchyInfo: hierarchyInfoMap, parentMap, childrenMap };
}
