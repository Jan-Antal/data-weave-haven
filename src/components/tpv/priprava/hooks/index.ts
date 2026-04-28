/**
 * Príprava hooks.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "../api";
import type {
  PreparationFilters,
  UpdateProjectPreparationInput,
  UpsertItemPreparationInput,
} from "../types";

export const preparationKeys = {
  all: ["tpv", "preparation"] as const,
  list: (filters: PreparationFilters) =>
    [...preparationKeys.all, "list", filters] as const,
  byProject: (projectId: string) =>
    [...preparationKeys.all, "by-project", projectId] as const,
};

export function useProjectsWithPreparation(
  filters: PreparationFilters = {}
) {
  return useQuery({
    queryKey: preparationKeys.list(filters),
    queryFn: () => api.fetchProjectsWithPreparation(filters),
    staleTime: 30_000,
  });
}

export function useItemsForProject(projectId: string | null) {
  return useQuery({
    queryKey: preparationKeys.byProject(projectId ?? "—"),
    queryFn: () =>
      projectId
        ? api.fetchItemsForProject(projectId)
        : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useUpdateProjectPreparation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectPreparationInput) =>
      api.updateProjectPreparation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preparationKeys.all });
      toast.success("Stav projektu uložený");
    },
    onError: (err: Error) => {
      toast.error("Uloženie zlyhalo", { description: err.message });
    },
  });
}

export function useUpsertItemPreparation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertItemPreparationInput) =>
      api.upsertItemPreparation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preparationKeys.all });
    },
    onError: (err: Error) => {
      toast.error("Uloženie zlyhalo", { description: err.message });
    },
  });
}
