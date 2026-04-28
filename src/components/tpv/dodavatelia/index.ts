/**
 * Dodávatelia tab — public exports.
 */

export { DodavateliaTab } from "./DodavateliaTab";
export { SupplierCRMDialog } from "./SupplierCRMDialog";

// Types
export type {
  TpvSupplierContactRow,
  CreateSupplierContactInput,
  UpdateSupplierContactInput,
  TpvSupplierPricelistRow,
  CreateSupplierPricelistInput,
  UpdateSupplierPricelistInput,
  TpvSupplierTaskRow,
  CreateSupplierTaskInput,
  UpdateSupplierTaskInput,
  TaskPriority,
  TaskStatus,
  SupplierCrmStats,
} from "./types";

// Hooks (rare external usage — most stays internal)
export {
  useSupplier,
  useSupplierContacts,
  useSupplierPricelist,
  useSupplierTasks,
  useSupplierSubcontracts,
} from "./hooks";

export { useSupabaseSuppliersList } from "./hooks-list";

// Pure helpers
export { computeSupplierStats } from "./api";
