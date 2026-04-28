/**
 * Materiál tab — public exports.
 * External consumers (TpvModule) import only MaterialTab.
 */

export { MaterialTab } from "./MaterialTab";
export type {
  TpvMaterialRow,
  MaterialView,
  MaterialFilters,
  MaterialStav,
  CreateMaterialInput,
  UpdateMaterialInput,
} from "./types";
export { MATERIAL_STAV, STAV_LABEL } from "./types";
