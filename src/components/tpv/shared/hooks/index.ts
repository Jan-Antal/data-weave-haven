/**
 * Shared TPV hooks — audit log + read-only refs.
 */

import { useQuery } from "@tanstack/react-query";

import * as auditApi from "../api/audit";
import * as itemsApi from "../api/tpv-items";
import * as projectsApi from "../api/projects";

// ============================================================
// QUERY KEYS
// ============================================================

const BASE = ["tpv", "shared"] as const;

export const sharedKeys = {
  all: BASE,
  audit: {
    subcontract: (id: string) =>
      [...BASE, "audit", "subcontract", id] as const,
    supplier: (id: string) => [...BASE, "audit", "supplier", id] as const,
  },
  tpvItem: (id: string) => [...BASE, "tpv-item", id] as const,
  tpvItemsForProject: (projectId: string) =>
    [...BASE, "tpv-items", "project", projectId] as const,
  project: (id: string) => [...BASE, "project", id] as const,
  activeProjects: [...BASE, "projects", "active"] as const,
};

// ============================================================
// AUDIT — read only
// ============================================================

export function useSubcontractAuditTrail(subcontractId: string | undefined) {
  return useQuery({
    queryKey: sharedKeys.audit.subcontract(subcontractId ?? ""),
    queryFn: () => auditApi.fetchSubcontractAuditTrail(subcontractId!),
    enabled: !!subcontractId,
  });
}

export function useSupplierAuditTrail(supplierId: string | undefined) {
  return useQuery({
    queryKey: sharedKeys.audit.supplier(supplierId ?? ""),
    queryFn: () => auditApi.fetchSupplierAuditTrail(supplierId!),
    enabled: !!supplierId,
  });
}

// ============================================================
// TPV ITEMS (read-only refs)
// ============================================================

export function useTpvItem(id: string | undefined) {
  return useQuery({
    queryKey: sharedKeys.tpvItem(id ?? ""),
    queryFn: () => itemsApi.fetchTpvItem(id!),
    enabled: !!id,
  });
}

export function useTpvItemsForProject(projectId: string | undefined) {
  return useQuery({
    queryKey: sharedKeys.tpvItemsForProject(projectId ?? ""),
    queryFn: () => itemsApi.fetchTpvItemsForProject(projectId!),
    enabled: !!projectId,
  });
}

// ============================================================
// PROJECTS (read-only refs)
// ============================================================

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: sharedKeys.project(projectId ?? ""),
    queryFn: () => projectsApi.fetchProject(projectId!),
    enabled: !!projectId,
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: sharedKeys.activeProjects,
    queryFn: () => projectsApi.fetchActiveProjects(),
  });
}
