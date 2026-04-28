/**
 * Materiál hooks — React Query wrappers over api/index.ts.
 *
 * Query keys hierarchy:
 *   ["tpv", "material", "list", filters]      — list
 *   ["tpv", "material", "detail", id]         — single row
 *   ["tpv", "material", "summaries", scope]   — derived aggregates
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "../api";
import type {
  MaterialFilters,
  MaterialStav,
  CreateMaterialInput,
  UpdateMaterialInput,
} from "../types";

export const materialKeys = {
  all: ["tpv", "material"] as const,
  list: (filters: MaterialFilters) =>
    [...materialKeys.all, "list", filters] as const,
  detail: (id: string) => [...materialKeys.all, "detail", id] as const,
};

// ============================================================
// QUERIES
// ============================================================

export function useMaterials(filters: MaterialFilters = {}) {
  return useQuery({
    queryKey: materialKeys.list(filters),
    queryFn: () => api.fetchMaterials(filters),
    staleTime: 30_000,
  });
}

export function useMaterial(id: string | null) {
  return useQuery({
    queryKey: materialKeys.detail(id ?? "—"),
    queryFn: () => (id ? api.fetchMaterialById(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) => api.createMaterial(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success("Materiál pridaný");
    },
    onError: (err: Error) => {
      toast.error("Pridanie materiálu zlyhalo", {
        description: err.message,
      });
    },
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMaterialInput) => api.updateMaterial(input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      qc.invalidateQueries({ queryKey: materialKeys.detail(row.id) });
    },
    onError: (err: Error) => {
      toast.error("Úprava materiálu zlyhala", {
        description: err.message,
      });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success("Materiál zmazaný");
    },
    onError: (err: Error) => {
      toast.error("Zmazanie zlyhalo", {
        description: err.message,
      });
    },
  });
}

export function useBulkInsertMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: CreateMaterialInput[]) => api.bulkInsertMaterials(rows),
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success(`Importovaných ${rows.length} položiek`);
    },
    onError: (err: Error) => {
      toast.error("Import zlyhal", { description: err.message });
    },
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, stav }: { ids: string[]; stav: MaterialStav }) =>
      api.bulkUpdateStatus(ids, stav),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success(`Stav aktualizovaný (${vars.ids.length} položiek)`);
    },
    onError: (err: Error) => {
      toast.error("Hromadná aktualizácia zlyhala", {
        description: err.message,
      });
    },
  });
}
