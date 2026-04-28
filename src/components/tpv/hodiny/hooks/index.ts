/**
 * Hodiny hooks — React Query wrappers.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "../api";
import type {
  HoursFilters,
  UpsertAllocationInput,
  SubmitAllocationInput,
  ApproveAllocationInput,
  ReturnAllocationInput,
} from "../types";

export const hoursKeys = {
  all: ["tpv", "hours"] as const,
  list: (filters: HoursFilters) =>
    [...hoursKeys.all, "list", filters] as const,
  byProject: (projectId: string) =>
    [...hoursKeys.all, "by-project", projectId] as const,
  rollups: () => [...hoursKeys.all, "rollups"] as const,
};

// ============================================================
// QUERIES
// ============================================================

export function useAllocations(filters: HoursFilters = {}) {
  return useQuery({
    queryKey: hoursKeys.list(filters),
    queryFn: () => api.fetchAllocations(filters),
    staleTime: 30_000,
  });
}

export function useProjectItemsWithAllocations(
  projectId: string | null
) {
  return useQuery({
    queryKey: hoursKeys.byProject(projectId ?? "—"),
    queryFn: () =>
      projectId
        ? api.fetchProjectItemsWithAllocations(projectId)
        : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useProjectRollups() {
  return useQuery({
    queryKey: hoursKeys.rollups(),
    queryFn: () => api.fetchProjectRollups(),
    staleTime: 30_000,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export function useUpsertAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAllocationInput) => api.upsertAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
    },
    onError: (err: Error) => {
      toast.error("Uloženie zlyhalo", { description: err.message });
    },
  });
}

export function useSubmitAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitAllocationInput) => api.submitAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
      toast.success("Odoslané PM na schválenie");
    },
    onError: (err: Error) => {
      toast.error("Odoslanie zlyhalo", { description: err.message });
    },
  });
}

export function useApproveAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveAllocationInput) => api.approveAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
      toast.success("Schválené");
    },
    onError: (err: Error) => {
      toast.error("Schválenie zlyhalo", { description: err.message });
    },
  });
}

export function useReturnAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnAllocationInput) => api.returnAllocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
      toast.success("Vrátené kalkulantovi");
    },
    onError: (err: Error) => {
      toast.error("Vrátenie zlyhalo", { description: err.message });
    },
  });
}

export function useBulkSubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.bulkSubmit(ids),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
      toast.success(`Odoslaných ${ids.length} prvkov`);
    },
    onError: (err: Error) => {
      toast.error("Hromadné odoslanie zlyhalo", { description: err.message });
    },
  });
}

export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.bulkApprove(ids),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: hoursKeys.all });
      toast.success(`Schválených ${ids.length} prvkov`);
    },
    onError: (err: Error) => {
      toast.error("Hromadné schválenie zlyhalo", { description: err.message });
    },
  });
}
