/**
 * Subdodávky tab — public exports.
 *
 * Audit, supplier CRM, and shared utilities live in their own modules
 * (../shared, ../dodavatelia) and are exposed there.
 */

// Main entry
export { SubdodavkyTab } from "./components/SubdodavkyTab";
export type { SubdodavkyTabProps } from "./components/SubdodavkyTab";

// Types
export type {
  SubcontractView,
  SubcontractStav,
  RequestStav,
  SubcontractPermissions,
  TpvSubcontractRow,
  TpvSubcontractRequestRow,
  ImportMode,
  ImportRowRaw,
  ImportRowValidated,
  ImportRowError,
  ImportPreviewResult,
} from "./types";

export { SUBCONTRACT_STAV, REQUEST_STAV, subcontractPermissionsFromTpv } from "./types";

// Helpers
export {
  STAV_LABELS,
  STAV_BADGE_CLASSES,
  REQUEST_STAV_LABELS,
  REQUEST_STAV_BADGE_CLASSES,
  computeStatusStrip,
  STRIP_BORDER_CLASSES,
  classifyType,
  groupByProject,
  groupBySupplier,
} from "./helpers";

// Hooks
export {
  useSubcontracts,
  useSubcontract,
  useSuppliers,
  useActiveProjects,
  useTpvItemsForProject,
  useCreateSubcontract,
  useUpdateSubcontract,
  useDeleteSubcontract,
  useCreateRFQRequests,
  useUpdateRFQRequest,
  useAwardRFQRequest,
  useDeleteRFQRequest,
} from "./hooks";

// Excel utilities
export {
  parseExcelFile,
  buildResolveContext,
  validateImportRows,
  bulkInsertSubcontracts,
  exportSubcontractsToXlsx,
  downloadImportTemplate,
} from "./api/excel";
