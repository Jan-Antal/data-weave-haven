/**
 * React Query hooks for Subdodávky module.
 *
 * Assumes @tanstack/react-query is configured at app root.
 * Toast notifications use sonner (already in app).
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "../api";
import type {
  SubcontractView,
  SubcontractFilters,
  CreateSubcontractInput,
  UpdateSubcontractInput,
  CreateRFQRequestInput,
  UpdateRFQRequestInput,
} from "../types";
import type {
  TpvSupplierRow,
  ProjectRef,
  TpvItemRef,
} from "../../shared/types";

// ============================================================
// QUERY KEYS — central registry, easier to invalidate
// ============================================================

export const subcontractKeys = {
  all: ["tpv", "subcontracts"] as const,
  lists: () => [...subcontractKeys.all, "list"] as const,
  list: (filters: SubcontractFilters) =>
    [...subcontractKeys.lists(), filters] as const,
  detail: (id: string) => [...subcontractKeys.all, "detail", id] as const,
  suppliers: (opts: { category?: string; search?: string }) =>
    ["tpv", "suppliers", opts] as const,
  projects: () => ["tpv", "projects-active"] as const,
  tpvItems: (projectId: string) =>
    ["tpv", "items", projectId] as const,
};

// ============================================================
// QUERIES
// ============================================================

export function useSubcontracts(
  filters: SubcontractFilters = {},
  options?: Omit<
    UseQueryOptions<SubcontractView[]>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: subcontractKeys.list(filters),
    queryFn: () => api.fetchSubcontracts(filters),
    ...options,
  });
}

export function useSubcontract(id: string | undefined) {
  return useQuery({
    queryKey: subcontractKeys.detail(id ?? ""),
    queryFn: () => api.fetchSubcontractById(id!),
    enabled: !!id,
  });
}

export function useSuppliers(opts: {
  category?: string;
  search?: string;
  onlyActive?: boolean;
} = {}) {
  return useQuery({
    queryKey: subcontractKeys.suppliers(opts),
    queryFn: () => api.fetchSuppliers(opts),
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: subcontractKeys.projects(),
    queryFn: () => api.fetchActiveProjects(),
  });
}

export function useTpvItemsForProject(projectId: string | undefined) {
  return useQuery({
    queryKey: subcontractKeys.tpvItems(projectId ?? ""),
    queryFn: () => api.fetchTpvItemsForProject(projectId!),
    enabled: !!projectId,
  });
}

// ============================================================
// MUTATIONS — Subcontract CRUD
// ============================================================

export function useCreateSubcontract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubcontractInput) => api.createSubcontract(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success("Subdodávka vytvorená");
    },
    onError: (error: Error) => {
      toast.error("Chyba pri vytváraní subdodávky", {
        description: error.message,
      });
    },
  });
}

export function useUpdateSubcontract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateSubcontractInput;
    }) => api.updateSubcontract(id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      qc.invalidateQueries({ queryKey: subcontractKeys.detail(vars.id) });
      toast.success("Subdodávka uložená");
    },
    onError: (error: Error) => {
      toast.error("Chyba pri ukladaní", { description: error.message });
    },
  });
}

export function useDeleteSubcontract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSubcontract(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success("Subdodávka odstránená");
    },
    onError: (error: Error) => {
      toast.error("Chyba pri odstraňovaní", { description: error.message });
    },
  });
}

// ============================================================
// MUTATIONS — RFQ flow
// ============================================================

export function useCreateRFQRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRFQRequestInput) => api.createRFQRequests(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success(
        `RFQ rozposlané ${data.length} ${
          data.length === 1 ? "dodávateľovi" : "dodávateľom"
        }`
      );
    },
    onError: (error: Error) => {
      toast.error("Chyba pri rozosielaní RFQ", { description: error.message });
    },
  });
}

export function useUpdateRFQRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateRFQRequestInput;
    }) => api.updateRFQRequest(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success("Ponuka uložená");
    },
    onError: (error: Error) => {
      toast.error("Chyba pri ukladaní ponuky", { description: error.message });
    },
  });
}

export function useAwardRFQRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => api.awardRFQRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success("Dodávateľ vybraný — subdodávka aktualizovaná");
    },
    onError: (error: Error) => {
      toast.error("Chyba pri výbere víťaza", { description: error.message });
    },
  });
}

export function useDeleteRFQRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRFQRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcontractKeys.all });
      toast.success("RFQ ponuka odstránená");
    },
  });
}
