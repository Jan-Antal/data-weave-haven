/**
 * Audit log API — read-only queries against tpv_audit_log.
 *
 * Writes are done by Postgres triggers (NOT from client) — see migration.
 * Therefore this file has only fetch functions.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TpvAuditLogRow, AuditLogFilters } from "../types";

/**
 * Fetch audit log entries by filter. Most recent first.
 * Default limit = 50.
 */
export async function fetchAuditLog(
  filters: AuditLogFilters
): Promise<TpvAuditLogRow[]> {
  let query = supabase
    .from("tpv_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.subcontract_id) {
    query = query.eq("subcontract_id", filters.subcontract_id);
  }
  if (filters.supplier_id) {
    query = query.eq("supplier_id", filters.supplier_id);
  }
  if (filters.project_id) {
    query = query.eq("project_id", filters.project_id);
  }
  if (filters.table_name) {
    query = query.eq("table_name", filters.table_name);
  }
  if (filters.actor_id) {
    query = query.eq("actor_id", filters.actor_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TpvAuditLogRow[];
}

/**
 * Fetch audit log for a single subcontract (and its RFQ requests).
 * Returns merged log: subcontract changes + request changes for that subcontract.
 */
export async function fetchSubcontractAuditTrail(
  subcontractId: string,
  limit = 100
): Promise<TpvAuditLogRow[]> {
  const { data, error } = await supabase
    .from("tpv_audit_log")
    .select("*")
    .eq("subcontract_id", subcontractId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TpvAuditLogRow[];
}

/**
 * Fetch audit log for a supplier (all changes touching this supplier across
 * supplier table itself + subcontracts/RFQs awarded/sent to this supplier).
 */
export async function fetchSupplierAuditTrail(
  supplierId: string,
  limit = 100
): Promise<TpvAuditLogRow[]> {
  const { data, error } = await supabase
    .from("tpv_audit_log")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TpvAuditLogRow[];
}
