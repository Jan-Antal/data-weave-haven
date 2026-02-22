// Types kept for backward compatibility
export type ProjectStatus = string;
export type RiskLevel = "Low" | "Medium" | "High";

// Legacy static list - only used as fallback. Dynamic data comes from useProjectStatusOptions.
export const statusOrder: ProjectStatus[] = [
  "Příprava",
  "Engineering", 
  "TPV",
  "Výroba IN",
  "Expedice",
  "Montáž",
  "Fakturace",
  "Dokončeno",
  "Reklamace",
];
