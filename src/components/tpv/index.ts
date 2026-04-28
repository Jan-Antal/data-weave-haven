/**
 * TPV (Technická Příprava Výroby) module — public API.
 *
 * Single entry point: import what you need from "@/components/tpv".
 *
 * Usage in parent:
 *
 *   import { TpvModule } from "@/components/tpv";
 *   import { useAuth } from "@/hooks/useAuth";
 *
 *   function TpvPage() {
 *     const { roles } = useAuth();
 *     return <TpvModule roles={roles} initialTab="subdodavky" />;
 *   }
 *
 * Internal structure:
 *   - shared/      — types, helpers, audit, read-only refs (Project Info)
 *   - priprava/    — readiness scoring (placeholder)
 *   - subdodavky/  — subcontracts + RFQ + Excel
 *   - material/    — material orders (placeholder)
 *   - hodiny/      — hours allocation/approval (placeholder)
 *   - dodavatelia/ — supplier CRM
 */

// Top-level entry
export { TpvModule } from "./TpvModule";
export type { TpvTabKey } from "./TpvModule";

// Shared types (most-used externally)
export type {
  AppRole,
  TpvPermissions,
  TpvSupplierRow,
  TpvItemRef,
  ProjectRef,
  Mena,
  TpvAuditLogRow,
  AuditAction,
  AuditLogFilters,
} from "./shared/types";

export { MENA } from "./shared/types";

export {
  formatMoney,
  formatMoneyCompact,
  formatDateShort,
  formatDateLong,
  daysUntil,
  relativeTime,
  computePermissions,
} from "./shared/helpers";

// Shared display components (parent may want to embed elsewhere)
export {
  AuditTrail,
  TpvItemRefDisplay,
  ProjectRefDisplay,
} from "./shared";

// Tab entry components — usually accessed via TpvModule, but exported
// in case parent wants to mount a single tab standalone
export { PripravaTab } from "./priprava";
export { SubdodavkyTab } from "./subdodavky";
export { MaterialTab } from "./material";
export { HodinyTab } from "./hodiny";
export { DodavateliaTab, SupplierCRMDialog } from "./dodavatelia";
