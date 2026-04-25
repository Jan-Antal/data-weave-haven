import type { AppRole } from "@/hooks/useAuth";

export type PermissionFlag =
  | "canEdit"
  | "canCreateProject"
  | "canDeleteProject"
  | "canEditProjectCode"
  | "canEditSmluvniTermin"
  | "canManageTPV"
  | "canAccessSettings"
  | "canManageUsers"
  | "canManagePeople"
  | "canManageExternisti"
  | "canManageProduction"
  | "canAccessAnalytics"
  | "canSeePrices"
  | "canAccessPlanVyroby"
  | "canWritePlanVyroby"
  | "canAccessDaylog"
  | "canQCOnly"
  | "canUploadDocuments"
  | "canPermanentDelete"
  | "canManageExchangeRates"
  | "canManageOverheadProjects"
  | "canManageStatuses"
  | "canAccessRecycleBin"
  | "canAccessTpv"
  | "canWriteTpv";

export const PERMISSION_FLAGS: PermissionFlag[] = [
  "canEdit",
  "canCreateProject",
  "canDeleteProject",
  "canEditProjectCode",
  "canEditSmluvniTermin",
  "canManageTPV",
  "canAccessSettings",
  "canManageUsers",
  "canManagePeople",
  "canManageExternisti",
  "canManageProduction",
  "canAccessAnalytics",
  "canSeePrices",
  "canAccessPlanVyroby",
  "canWritePlanVyroby",
  "canAccessDaylog",
  "canQCOnly",
  "canUploadDocuments",
  "canPermanentDelete",
  "canManageExchangeRates",
  "canManageOverheadProjects",
  "canManageStatuses",
  "canAccessRecycleBin",
  "canAccessTpv",
  "canWriteTpv",
];

export const PERMISSION_LABELS: Record<PermissionFlag, string> = {
  canEdit: "Editovať projekty",
  canCreateProject: "Vytvárať projekty",
  canDeleteProject: "Mazať projekty",
  canEditProjectCode: "Upravovať kód projektu",
  canEditSmluvniTermin: "Upravovať smluvný termín",
  canManageTPV: "Spravovať TPV",
  canAccessSettings: "Prístup do Nastavení",
  canManageUsers: "Spravovať používateľov",
  canManagePeople: "Spravovať osoby",
  canManageExternisti: "Spravovať externistov",
  canManageProduction: "Spravovať výrobu",
  canAccessAnalytics: "Prístup do Analytics",
  canSeePrices: "Vidieť ceny a marže",
  canAccessPlanVyroby: "Prístup do Plánu výroby",
  canWritePlanVyroby: "Upravovať Plán výroby",
  canAccessDaylog: "Prístup do Daylog",
  canQCOnly: "Iba kontrola kvality (QC)",
  canUploadDocuments: "Nahrávať dokumenty",
  canPermanentDelete: "Trvalé mazanie",
  canManageExchangeRates: "Spravovať kurzy",
  canManageOverheadProjects: "Spravovať réžijné projekty",
  canManageStatuses: "Spravovať stavy",
  canAccessRecycleBin: "Prístup do Koša",
  canAccessTpv: "Prístup do TPV modulu",
  canWriteTpv: "Upravovať dáta v TPV module",
};

export type Permissions = Record<PermissionFlag, boolean>;

const ALL_TRUE: Permissions = PERMISSION_FLAGS.reduce(
  (acc, k) => ({ ...acc, [k]: true }),
  {} as Permissions,
);
const ALL_FALSE: Permissions = PERMISSION_FLAGS.reduce(
  (acc, k) => ({ ...acc, [k]: false }),
  {} as Permissions,
);

function preset(...flags: PermissionFlag[]): Permissions {
  const out = { ...ALL_FALSE };
  flags.forEach((f) => {
    out[f] = true;
  });
  return out;
}

export const ROLE_PRESETS: Record<AppRole, Permissions> = {
  owner: { ...ALL_TRUE },
  admin: { ...ALL_TRUE, canQCOnly: false, canAccessTpv: false, canWriteTpv: false },
  vedouci_pm: preset(
    "canEdit",
    "canCreateProject",
    "canDeleteProject",
    "canEditProjectCode",
    "canEditSmluvniTermin",
    "canManageTPV",
    "canManagePeople",
    "canManageExternisti",
    "canAccessAnalytics",
    "canSeePrices",
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
    "canPermanentDelete",
    "canManageOverheadProjects",
    "canAccessRecycleBin",
  ),
  pm: preset(
    "canEdit",
    "canCreateProject",
    "canManageTPV",
    "canManagePeople",
    "canManageExternisti",
    "canAccessAnalytics",
    "canSeePrices",
    "canAccessPlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
    "canAccessRecycleBin",
  ),
  vedouci_konstrukter: preset(
    "canEdit",
    "canManageTPV",
    "canManagePeople",
    "canManageExternisti",
    "canAccessAnalytics",
    "canUploadDocuments",
    "canAccessRecycleBin",
  ),
  konstrukter: preset(
    "canEdit",
    "canManageTPV",
    "canUploadDocuments",
    "canAccessRecycleBin",
  ),
  vedouci_vyroby: preset(
    "canEdit",
    "canManageProduction",
    "canAccessAnalytics",
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
  ),
  mistr: preset(
    "canManageProduction",
    "canAccessPlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
  ),
  quality: preset("canAccessDaylog", "canQCOnly"),
  kalkulant: preset("canAccessAnalytics", "canSeePrices", "canManageOverheadProjects"),
  viewer: preset(
    "canAccessPlanVyroby",
    "canAccessDaylog",
    "canAccessAnalytics",
  ),
  // Backward-compat: vyroba mirrors vedouci_vyroby
  vyroba: preset(
    "canEdit",
    "canManageProduction",
    "canAccessAnalytics",
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
  ),
  // Tester mirrors PM (sandbox)
  tester: preset(
    "canEdit",
    "canCreateProject",
    "canManageTPV",
    "canManagePeople",
    "canManageExternisti",
    "canAccessAnalytics",
    "canSeePrices",
    "canAccessPlanVyroby",
    "canAccessDaylog",
    "canUploadDocuments",
    "canAccessRecycleBin",
  ),
};

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  vedouci_pm: "Vedoucí PM",
  pm: "PM",
  vedouci_konstrukter: "Vedoucí konstruktér",
  konstrukter: "Konstruktér",
  vedouci_vyroby: "Vedoucí výroby",
  mistr: "Mistr",
  quality: "Kontrola kvality",
  kalkulant: "Kalkulant",
  viewer: "Viewer",
  vyroba: "Výroba",
  tester: "Tester",
};

/**
 * Resolve final permissions for a user.
 * - If `overrides` is null/undefined → use the role preset as-is.
 * - If `overrides` is provided → use overrides for any keys present, fall back to preset for missing keys.
 */
export function resolvePermissions(
  role: AppRole | null,
  overrides: Partial<Permissions> | null | undefined,
): Permissions {
  const base: Permissions = role ? { ...ROLE_PRESETS[role] } : { ...ALL_FALSE };
  if (!overrides) return base;
  const out = { ...base };
  for (const key of PERMISSION_FLAGS) {
    if (typeof overrides[key] === "boolean") {
      out[key] = overrides[key] as boolean;
    }
  }
  return out;
}
