/**
 * Materiál hooks — React Query wrappers over api/index.ts (PR #6).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "../api";
import type {
  MaterialFilters,
  CreateMaterialInput,
  UpdateMaterialInput,
  UpsertLinkInput,
  MergeMaterialsInput,
  CreateSampleInput,
  UpdateSampleInput,
} from "../types";

export const materialKeys = {
  all: ["tpv", "material"] as const,
  list: (filters: MaterialFilters) =>
    [...materialKeys.all, "list", filters] as const,
  detail: (id: string) => [...materialKeys.all, "detail", id] as const,
  samples: (materialId: string) =>
    [...materialKeys.all, "samples", materialId] as const,
};

// ============================================================
// Materials — list / detail
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
    queryFn: () =>
      id ? api.fetchMaterialById(id) : Promise.resolve(null),
    enabled: !!id,
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) => api.createMaterial(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success("Materiál pridaný");
    },
    onError: (err: Error) =>
      toast.error("Pridanie zlyhalo", { description: err.message }),
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
    onError: (err: Error) =>
      toast.error("Úprava zlyhala", { description: err.message }),
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
    onError: (err: Error) =>
      toast.error("Zmazanie zlyhalo", { description: err.message }),
  });
}

// ============================================================
// Links — material ↔ items
// ============================================================

export function useUpsertLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLinkInput) => api.upsertLink(input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      qc.invalidateQueries({ queryKey: materialKeys.detail(row.material_id) });
    },
    onError: (err: Error) =>
      toast.error("Naviazanie zlyhalo", { description: err.message }),
  });
}

export function useRemoveLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.removeLink(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
    onError: (err: Error) =>
      toast.error("Odpojenie zlyhalo", { description: err.message }),
  });
}

// ============================================================
// Merge
// ============================================================

export function useMergeMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MergeMaterialsInput) => api.mergeMaterials(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success(
        `Zlúčené ${vars.source_ids.length} materiálov do cieľového`
      );
    },
    onError: (err: Error) =>
      toast.error("Zlúčenie zlyhalo", { description: err.message }),
  });
}

// ============================================================
// Samples
// ============================================================

export function useSamples(materialId: string | null) {
  return useQuery({
    queryKey: materialKeys.samples(materialId ?? "—"),
    queryFn: () =>
      materialId
        ? api.fetchSamplesForMaterial(materialId)
        : Promise.resolve([]),
    enabled: !!materialId,
    staleTime: 15_000,
  });
}

export function useCreateSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSampleInput) => api.createSample(input),
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: materialKeys.samples(row.material_id),
      });
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success("Vzorka pridaná");
    },
    onError: (err: Error) =>
      toast.error("Pridanie vzorky zlyhalo", { description: err.message }),
  });
}

export function useUpdateSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSampleInput) => api.updateSample(input),
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: materialKeys.samples(row.material_id),
      });
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
    onError: (err: Error) =>
      toast.error("Úprava vzorky zlyhala", { description: err.message }),
  });
}

export function useDeleteSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSample(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
    },
    onError: (err: Error) =>
      toast.error("Zmazanie vzorky zlyhalo", { description: err.message }),
  });
}

export function useApproveSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sampleId: string) =>
      api.approveSampleAndUpdateMaterial(sampleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialKeys.all });
      toast.success("Vzorka schválená — materiál aktualizovaný");
    },
    onError: (err: Error) =>
      toast.error("Schválenie zlyhalo", { description: err.message }),
  });
}
