import type { AppRole } from "@/hooks/useAuth";

export type PermissionFlag =
  // ===== Existujúce =====
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
  | "canWriteTpv"
  // ===== NOVÉ master flagy modulov =====
  | "canAccessSystem"
  | "canAccessOsoby"
  | "canAccessProjectInfo"
  // ===== Sub-záložky Systém =====
  | "canAccessExchangeRates"
  | "canAccessOverheadProjects"
  | "canAccessFormulaBuilder"
  // ===== Sub-záložky Správa osob =====
  | "canAccessZamestnanci"
  | "canAccessExternistiTab"
  | "canAccessUzivateleTab"
  | "canAccessOpravneni"
  | "canAccessKatalog"
  | "canAccessKapacita"
  // ===== Sub-záložky Analytics =====
  | "canAccessAnalyticsProjekty"
  | "canAccessAnalyticsRezije"
  | "canAccessAnalyticsDilna"
  | "canAccessAnalyticsVykaz"
  // ===== Sub-záložky Project Info (R/W) =====
  | "canViewProjectInfoTab"
  | "canWriteProjectInfoTab"
  | "canViewPMStatusTab"
  | "canWritePMStatusTab"
  | "canViewTPVStatusTab"
  | "canWriteTPVStatusTab"
  | "canViewTPVListTab"
  | "canWriteTPVListTab"
  | "canViewHarmonogram"
  | "canWriteHarmonogram"
  // ===== Sub-záložky Plán výroby =====
  | "canAccessForecast"
  // ===== Sub-záložky Modul Výroba =====
  | "canAccessQC"
  | "canWriteDaylog"
  | "canWriteQC"
  // ===== Sub-záložky TPV =====
  | "canViewTpvPrehlad"
  | "canWriteTpvPrehlad"
  | "canViewTpvMaterial"
  | "canWriteTpvMaterial"
  | "canViewTpvHodinovaDotacia"
  | "canWriteTpvHodinovaDotacia";

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
  "canAccessSystem",
  "canAccessOsoby",
  "canAccessProjectInfo",
  "canAccessExchangeRates",
  "canAccessOverheadProjects",
  "canAccessFormulaBuilder",
  "canAccessZamestnanci",
  "canAccessExternistiTab",
  "canAccessUzivateleTab",
  "canAccessOpravneni",
  "canAccessKatalog",
  "canAccessKapacita",
  "canAccessAnalyticsProjekty",
  "canAccessAnalyticsRezije",
  "canAccessAnalyticsDilna",
  "canAccessAnalyticsVykaz",
  "canViewProjectInfoTab",
  "canWriteProjectInfoTab",
  "canViewPMStatusTab",
  "canWritePMStatusTab",
  "canViewTPVStatusTab",
  "canWriteTPVStatusTab",
  "canViewTPVListTab",
  "canWriteTPVListTab",
  "canViewHarmonogram",
  "canWriteHarmonogram",
  "canAccessForecast",
  "canAccessQC",
  "canWriteDaylog",
  "canWriteQC",
  "canViewTpvPrehlad",
  "canWriteTpvPrehlad",
  "canViewTpvMaterial",
  "canWriteTpvMaterial",
  "canViewTpvHodinovaDotacia",
  "canWriteTpvHodinovaDotacia",
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
  canQCOnly: "Iba kontrola kvality (legacy)",
  canUploadDocuments: "Nahrávať dokumenty",
  canPermanentDelete: "Trvalé mazanie",
  canManageExchangeRates: "Spravovať kurzy",
  canManageOverheadProjects: "Spravovať réžijné projekty",
  canManageStatuses: "Spravovať stavy",
  canAccessRecycleBin: "Prístup do Koša",
  canAccessTpv: "Prístup do TPV modulu",
  canWriteTpv: "Upravovať dáta v TPV module",
  canAccessSystem: "Modul Systém",
  canAccessOsoby: "Modul Správa osob",
  canAccessProjectInfo: "Modul Project Info",
  canAccessExchangeRates: "Záložka: Kurzový lístok",
  canAccessOverheadProjects: "Záložka: Réžijné projekty",
  canAccessFormulaBuilder: "Záložka: Výpočetná logika",
  canAccessZamestnanci: "Záložka: Zamestnanci",
  canAccessExternistiTab: "Záložka: Externisti",
  canAccessUzivateleTab: "Záložka: Užívatelia",
  canAccessOpravneni: "Záložka: Oprávnení",
  canAccessKatalog: "Záložka: Pozície & číselníky",
  canAccessKapacita: "Záložka: Kapacita",
  canAccessAnalyticsProjekty: "Záložka: Projekty",
  canAccessAnalyticsRezije: "Záložka: Réžie",
  canAccessAnalyticsDilna: "Záložka: Dílna",
  canAccessAnalyticsVykaz: "Záložka: Výkaz",
  canViewProjectInfoTab: "View: Project Info",
  canWriteProjectInfoTab: "Write: Project Info",
  canViewPMStatusTab: "View: PM Status",
  canWritePMStatusTab: "Write: PM Status",
  canViewTPVStatusTab: "View: TPV Status",
  canWriteTPVStatusTab: "Write: TPV Status",
  canViewTPVListTab: "View: TPV List",
  canWriteTPVListTab: "Write: TPV List",
  canViewHarmonogram: "View: Harmonogram",
  canWriteHarmonogram: "Write: Harmonogram",
  canAccessForecast: "Záložka: Forecast",
  canAccessQC: "View: Kontrola kvality (QC)",
  canWriteDaylog: "Write: Daylog",
  canWriteQC: "Write: Kontrola kvality (QC)",
  canViewTpvPrehlad: "View: TPV Prehľad",
  canWriteTpvPrehlad: "Write: TPV Prehľad",
  canViewTpvMaterial: "View: TPV Materiál",
  canWriteTpvMaterial: "Write: TPV Materiál",
  canViewTpvHodinovaDotacia: "View: TPV Hodinová dotácia",
  canWriteTpvHodinovaDotacia: "Write: TPV Hodinová dotácia",
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

/**
 * MASTER → SUB cascade. Ak je master modulu vypnutý,
 * vynuluje všetky jeho sub-flagy.
 * Volá sa v resolvePermissions() po merge.
 */
const MODULE_CASCADE: Array<{ master: PermissionFlag; subs: PermissionFlag[] }> = [
  {
    master: "canAccessSystem",
    subs: [
      "canAccessExchangeRates",
      "canAccessOverheadProjects",
      "canAccessFormulaBuilder",
      "canManageExchangeRates",
      "canManageOverheadProjects",
      "canManageStatuses",
      "canAccessSettings",
    ],
  },
  {
    master: "canAccessOsoby",
    subs: [
      "canAccessZamestnanci",
      "canAccessExternistiTab",
      "canAccessUzivateleTab",
      "canAccessOpravneni",
      "canAccessKatalog",
      "canAccessKapacita",
      "canManagePeople",
      "canManageExternisti",
      "canManageUsers",
    ],
  },
  {
    master: "canAccessProjectInfo",
    subs: [
      "canViewProjectInfoTab",
      "canWriteProjectInfoTab",
      "canViewPMStatusTab",
      "canWritePMStatusTab",
      "canViewTPVStatusTab",
      "canWriteTPVStatusTab",
      "canViewTPVListTab",
      "canWriteTPVListTab",
      "canViewHarmonogram",
      "canWriteHarmonogram",
      "canCreateProject",
      "canDeleteProject",
      "canEditProjectCode",
      "canEditSmluvniTermin",
      "canSeePrices",
      "canUploadDocuments",
      "canPermanentDelete",
      "canAccessRecycleBin",
      "canManageTPV",
      "canEdit",
    ],
  },
  {
    master: "canAccessPlanVyroby",
    subs: ["canWritePlanVyroby", "canAccessForecast"],
  },
  {
    master: "canManageProduction",
    subs: ["canAccessDaylog", "canAccessQC", "canQCOnly", "canWriteDaylog", "canWriteQC"],
  },
  {
    master: "canAccessAnalytics",
    subs: [
      "canAccessAnalyticsProjekty",
      "canAccessAnalyticsRezije",
      "canAccessAnalyticsDilna",
      "canAccessAnalyticsVykaz",
    ],
  },
  {
    master: "canAccessTpv",
    subs: [
      "canWriteTpv",
      "canViewTpvPrehlad",
      "canWriteTpvPrehlad",
      "canViewTpvMaterial",
      "canWriteTpvMaterial",
      "canViewTpvHodinovaDotacia",
      "canWriteTpvHodinovaDotacia",
    ],
  },
];

/**
 * Aplikuje cascade: ak master je false, sub-flagy sa vynulujú.
 */
function applyCascade(p: Permissions): Permissions {
  const out = { ...p };
  for (const { master, subs } of MODULE_CASCADE) {
    if (!out[master]) {
      for (const s of subs) out[s] = false;
    }
  }
  // Write implikuje Read v R/W pároch
  const RW_PAIRS: Array<[PermissionFlag, PermissionFlag]> = [
    ["canViewProjectInfoTab", "canWriteProjectInfoTab"],
    ["canViewPMStatusTab", "canWritePMStatusTab"],
    ["canViewTPVStatusTab", "canWriteTPVStatusTab"],
    ["canViewTPVListTab", "canWriteTPVListTab"],
    ["canViewHarmonogram", "canWriteHarmonogram"],
    ["canViewTpvPrehlad", "canWriteTpvPrehlad"],
    ["canViewTpvMaterial", "canWriteTpvMaterial"],
    ["canViewTpvHodinovaDotacia", "canWriteTpvHodinovaDotacia"],
    ["canAccessDaylog", "canWriteDaylog"],
    ["canAccessQC", "canWriteQC"],
  ];
  for (const [view, write] of RW_PAIRS) {
    if (out[write]) out[view] = true;
  }
  return out;
}

// Helper: granted všetky sub-flagy modulu
const projectInfoFull: PermissionFlag[] = [
  "canAccessProjectInfo",
  "canViewProjectInfoTab",
  "canWriteProjectInfoTab",
  "canViewPMStatusTab",
  "canWritePMStatusTab",
  "canViewTPVStatusTab",
  "canWriteTPVStatusTab",
  "canViewTPVListTab",
  "canWriteTPVListTab",
  "canViewHarmonogram",
  "canWriteHarmonogram",
];

const projectInfoReadOnly: PermissionFlag[] = [
  "canAccessProjectInfo",
  "canViewProjectInfoTab",
  "canViewPMStatusTab",
  "canViewTPVStatusTab",
  "canViewTPVListTab",
  "canViewHarmonogram",
];

const analyticsFull: PermissionFlag[] = [
  "canAccessAnalytics",
  "canAccessAnalyticsProjekty",
  "canAccessAnalyticsRezije",
  "canAccessAnalyticsDilna",
  "canAccessAnalyticsVykaz",
];

const osobyFull: PermissionFlag[] = [
  "canAccessOsoby",
  "canAccessZamestnanci",
  "canAccessExternistiTab",
  "canAccessUzivateleTab",
  "canAccessOpravneni",
  "canAccessKatalog",
  "canAccessKapacita",
];

const systemFull: PermissionFlag[] = [
  "canAccessSystem",
  "canAccessExchangeRates",
  "canAccessOverheadProjects",
  "canAccessFormulaBuilder",
];

export const ROLE_PRESETS: Record<AppRole, Permissions> = {
  owner: { ...ALL_TRUE },
  admin: { ...ALL_TRUE, canQCOnly: false, canAccessTpv: false, canWriteTpv: false, canViewTpvPrehlad: false, canWriteTpvPrehlad: false, canViewTpvMaterial: false, canWriteTpvMaterial: false, canViewTpvHodinovaDotacia: false, canWriteTpvHodinovaDotacia: false },
  vedouci_pm: preset(
    ...projectInfoFull,
    "canCreateProject",
    "canDeleteProject",
    "canEditProjectCode",
    "canEditSmluvniTermin",
    "canManageTPV",
    "canEdit",
    "canSeePrices",
    "canUploadDocuments",
    "canPermanentDelete",
    "canAccessRecycleBin",
    ...analyticsFull,
    ...osobyFull,
    "canManagePeople",
    "canManageExternisti",
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessForecast",
    "canAccessDaylog",
    "canManageOverheadProjects",
  ),
  pm: preset(
    ...projectInfoFull,
    "canCreateProject",
    "canManageTPV",
    "canEdit",
    "canSeePrices",
    "canUploadDocuments",
    "canAccessRecycleBin",
    ...analyticsFull,
    ...osobyFull,
    "canManagePeople",
    "canManageExternisti",
    "canAccessPlanVyroby",
    "canAccessDaylog",
  ),
  vedouci_konstrukter: preset(
    ...projectInfoFull,
    "canManageTPV",
    "canEdit",
    "canUploadDocuments",
    "canAccessRecycleBin",
    ...analyticsFull,
    ...osobyFull,
    "canManagePeople",
    "canManageExternisti",
  ),
  konstrukter: preset(
    ...projectInfoFull,
    "canManageTPV",
    "canEdit",
    "canUploadDocuments",
    "canAccessRecycleBin",
  ),
  vedouci_vyroby: preset(
    ...projectInfoReadOnly,
    "canEdit",
    "canManageProduction",
    "canAccessDaylog",
    "canAccessQC",
    ...analyticsFull,
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessForecast",
    "canUploadDocuments",
  ),
  mistr: preset(
    ...projectInfoReadOnly,
    "canManageProduction",
    "canAccessDaylog",
    "canAccessQC",
    "canAccessPlanVyroby",
    "canUploadDocuments",
  ),
  quality: preset(
    "canManageProduction",
    "canAccessDaylog",
    "canAccessQC",
    "canQCOnly",
  ),
  kalkulant: preset(
    ...analyticsFull,
    "canSeePrices",
    "canAccessSystem",
    "canAccessOverheadProjects",
    "canManageOverheadProjects",
  ),
  viewer: preset(
    ...projectInfoReadOnly,
    "canAccessPlanVyroby",
    "canAccessDaylog",
    ...analyticsFull,
  ),
  vyroba: preset(
    ...projectInfoReadOnly,
    "canEdit",
    "canManageProduction",
    "canAccessDaylog",
    "canAccessQC",
    ...analyticsFull,
    "canAccessPlanVyroby",
    "canWritePlanVyroby",
    "canAccessForecast",
    "canUploadDocuments",
  ),
  tester: preset(
    ...projectInfoFull,
    "canCreateProject",
    "canManageTPV",
    "canEdit",
    "canSeePrices",
    "canUploadDocuments",
    "canAccessRecycleBin",
    ...analyticsFull,
    ...osobyFull,
    "canManagePeople",
    "canManageExternisti",
    "canAccessPlanVyroby",
    "canAccessDaylog",
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
 * - merge: preset → role default (DB) → user override (DB).
 * - Cascade master → sub sa aplikuje na konci.
 */
export function resolvePermissions(
  role: AppRole | null,
  overrides: Partial<Permissions> | null | undefined,
): Permissions {
  const base: Permissions = role ? { ...ROLE_PRESETS[role] } : { ...ALL_FALSE };
  const merged = { ...base };
  if (overrides) {
    for (const key of PERMISSION_FLAGS) {
      if (typeof overrides[key] === "boolean") {
        merged[key] = overrides[key] as boolean;
      }
    }
  }
  return applyCascade(merged);
}
