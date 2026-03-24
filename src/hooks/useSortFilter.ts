import { useState, useMemo } from "react";
import { matchesStatusFilter, normalizeSearch } from "@/lib/statusFilter";

type SortDir = "asc" | "desc" | null;


interface ExternalFilters {
  personFilter?: string | null;
  statusFilter?: string[];
}

export function useSortFilter<T extends Record<string, any>>(data: T[], externalFilters?: ExternalFilters, externalSearch?: string) {
  const [sortCol, setSortCol] = useState<string | null>("project_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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

  const filtered = useMemo(() => {
    let result = data;

    // Person filter: show projects where person appears in pm, konstrukter, or kalkulant
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
      const allowed = new Set(externalFilters.statusFilter);
      result = result.filter(row => matchesStatusFilter(row.status, allowed));
    } else if (externalFilters?.statusFilter && externalFilters.statusFilter.length === 0) {
      result = [];
    }

    // Text search — diacritics-insensitive
    if (search) {
      const q = normalizeSearch(search);
      result = result.filter(row =>
        Object.values(row).some(v => {
          if (v == null) return false;
          const s = String(v);
          // Skip long JSON-like values
          if (s.length > 500 || s.startsWith("{") || s.startsWith("[")) return false;
          return normalizeSearch(s).includes(q);
        })
      );
    }

    return result;
  }, [data, search, externalFilters?.personFilter, externalFilters?.statusFilter]);

  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortCol, sortDir]);

  return { sorted, search, setSearch, sortCol, sortDir, toggleSort };
}
