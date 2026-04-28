/**
 * Shared exports — used by all TPV tabs.
 *
 * Tab-specific code imports from this file via "../shared".
 * External consumers (Tpv.tsx parent) import from "@/components/tpv".
 */

export type {
  // Constants
  Mena,
  // Refs
  TpvItemRef,
  ProjectRef,
  // Owned shared entity
  TpvSupplierRow,
  // Auth
  AppRole,
  TpvPermissions,
  // Audit
  AuditAction,
  TpvAuditLogRow,
  AuditLogFilters,
} from "./types";

export { MENA } from "./types";

export {
  formatMoney,
  formatMoneyCompact,
  formatDateShort,
  formatDateLong,
  daysUntil,
  relativeTime,
  computePermissions,
} from "./helpers";

// API
export * as auditApi from "./api/audit";
export * as tpvItemsApi from "./api/tpv-items";
export * as projectsApi from "./api/projects";

// Hooks
export {
  sharedKeys,
  useSubcontractAuditTrail,
  useSupplierAuditTrail,
  useTpvItem,
  useTpvItemsForProject,
  useProject,
  useActiveProjects,
} from "./hooks";

// Components
export { AuditTrail } from "./components/AuditTrail";
export type { AuditTrailProps } from "./components/AuditTrail";
export { TpvItemRefDisplay } from "./components/TpvItemRefDisplay";
export { ProjectRefDisplay } from "./components/ProjectRefDisplay";
