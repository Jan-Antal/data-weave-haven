import { useState, useMemo } from "react";

type SortDir = "asc" | "desc" | null;

const BEZ_STATUSU = "__bez_statusu__";

interface ExternalFilters {
  personFilter?: string | null;
  statusFilter?: string[];
}

export function useSortFilter<T extends Record<string, any>>(data: T[], externalFilters?: ExternalFilters) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [search, setSearch] = useState("");

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
      const allowed = externalFilters.statusFilter;
      const showNoStatus = allowed.includes(BEZ_STATUSU);
      result = result.filter(row => {
        const status = row.status;
        if (!status) return showNoStatus;
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
