// Types kept for backward compatibility with StatusBadge components
export type ProjectStatus = 
  | "Příprava" 
  | "Engineering" 
  | "TPV" 
  | "Výroba IN" 
  | "Expedice" 
  | "Montáž" 
  | "Fakturace" 
  | "Dokončeno"
  | "Reklamace";

export type RiskLevel = "Low" | "Medium" | "High";

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
