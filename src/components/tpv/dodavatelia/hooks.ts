/**
 * React Query hooks for Supplier CRM (Dodávatelia tab).
 *
 * Audit hooks live in shared/ — import them via "../shared".
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as crmApi from "./api";
import type {
  CreateSupplierContactInput,
  UpdateSupplierContactInput,
  CreateSupplierPricelistInput,
  UpdateSupplierPricelistInput,
  CreateSupplierTaskInput,
  UpdateSupplierTaskInput,
} from "./types";

// ============================================================
// QUERY KEYS
// ============================================================

export const crmKeys = {
  all: ["tpv", "crm"] as const,
  supplier: (id: string) => [...crmKeys.all, "supplier", id] as const,
  contacts: (supplierId: string) =>
    [...crmKeys.all, "contacts", supplierId] as const,
  pricelist: (supplierId: string) =>
    [...crmKeys.all, "pricelist", supplierId] as const,
  tasks: (supplierId: string) =>
    [...crmKeys.all, "tasks", supplierId] as const,
  subcontracts: (supplierId: string) =>
    [...crmKeys.all, "subcontracts", supplierId] as const,
};

// ============================================================
// CRM — supplier basic
// ============================================================

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: crmKeys.supplier(id ?? ""),
    queryFn: () => crmApi.fetchSupplierById(id!),
    enabled: !!id,
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof crmApi.updateSupplier>[1];
    }) => crmApi.updateSupplier(id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.supplier(vars.id) });
      qc.invalidateQueries({ queryKey: ["tpv", "suppliers"] });
      toast.success("Dodávateľ uložený");
    },
    onError: (e: Error) =>
      toast.error("Chyba pri ukladaní", { description: e.message }),
  });
}

// ============================================================
// CRM — contacts
// ============================================================

export function useSupplierContacts(supplierId: string | undefined) {
  return useQuery({
    queryKey: crmKeys.contacts(supplierId ?? ""),
    queryFn: () => crmApi.fetchSupplierContacts(supplierId!),
    enabled: !!supplierId,
  });
}

export function useCreateSupplierContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierContactInput) =>
      crmApi.createSupplierContact(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.contacts(vars.supplier_id) });
      toast.success("Kontakt pridaný");
    },
    onError: (e: Error) =>
      toast.error("Chyba pri pridávaní kontaktu", { description: e.message }),
  });
}

export function useUpdateSupplierContact(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateSupplierContactInput;
    }) => crmApi.updateSupplierContact(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.contacts(supplierId) });
      toast.success("Kontakt uložený");
    },
    onError: (e: Error) =>
      toast.error("Chyba pri ukladaní kontaktu", { description: e.message }),
  });
}

export function useDeleteSupplierContact(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmApi.deleteSupplierContact(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.contacts(supplierId) });
      toast.success("Kontakt odstránený");
    },
  });
}

// ============================================================
// CRM — pricelist
// ============================================================

export function useSupplierPricelist(
  supplierId: string | undefined,
  onlyActive = true
) {
  return useQuery({
    queryKey: [...crmKeys.pricelist(supplierId ?? ""), { onlyActive }],
    queryFn: () =>
      crmApi.fetchSupplierPricelist(supplierId!, { onlyActive }),
    enabled: !!supplierId,
  });
}

export function useCreatePricelistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierPricelistInput) =>
      crmApi.createPricelistItem(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.pricelist(vars.supplier_id) });
      toast.success("Cenníková položka pridaná");
    },
    onError: (e: Error) =>
      toast.error("Chyba pri pridávaní položky", { description: e.message }),
  });
}

export function useUpdatePricelistItem(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateSupplierPricelistInput;
    }) => crmApi.updatePricelistItem(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.pricelist(supplierId) });
      toast.success("Položka uložená");
    },
  });
}

export function useDeletePricelistItem(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmApi.deletePricelistItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.pricelist(supplierId) });
      toast.success("Položka odstránená");
    },
  });
}

// ============================================================
// CRM — tasks
// ============================================================

export function useSupplierTasks(
  supplierId: string | undefined,
  onlyOpen = false
) {
  return useQuery({
    queryKey: [...crmKeys.tasks(supplierId ?? ""), { onlyOpen }],
    queryFn: () => crmApi.fetchSupplierTasks(supplierId!, { onlyOpen }),
    enabled: !!supplierId,
  });
}

export function useCreateSupplierTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierTaskInput) =>
      crmApi.createSupplierTask(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.tasks(vars.supplier_id) });
      toast.success("Úloha pridaná");
    },
    onError: (e: Error) =>
      toast.error("Chyba pri pridávaní úlohy", { description: e.message }),
  });
}

export function useUpdateSupplierTask(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateSupplierTaskInput;
    }) => crmApi.updateSupplierTask(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.tasks(supplierId) });
    },
  });
}

export function useDeleteSupplierTask(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmApi.deleteSupplierTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.tasks(supplierId) });
      toast.success("Úloha odstránená");
    },
  });
}

// ============================================================
// CRM — supplier subcontracts (for "Zákazky" tab + stats)
// ============================================================

export function useSupplierSubcontracts(supplierId: string | undefined) {
  return useQuery({
    queryKey: crmKeys.subcontracts(supplierId ?? ""),
    queryFn: () => crmApi.fetchSupplierSubcontracts(supplierId!),
    enabled: !!supplierId,
  });
}
