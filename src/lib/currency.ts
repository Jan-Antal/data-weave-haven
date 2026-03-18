/**
 * Format monetary value with proper Czech formatting.
 * CZK: "1 234 567 Kč" (whole numbers, no decimals)
 * EUR: "12 345,5 €" (1 decimal place)
 */
export function formatCurrency(value: number | null, currency: string = "CZK"): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "—";

  if (currency === "EUR") {
    const formatted = new Intl.NumberFormat("cs-CZ", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
    return `${formatted} €`;
  }

  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
  return `${formatted} Kč`;
}

/**
 * Format marže (margin) for display.
 * Stored as decimal (e.g. 0.22), displayed as "22 %" or "22,5 %".
 * Accepts both string and number inputs.
 */
export function formatMarze(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
  if (isNaN(num)) return "—";
  const percent = num * 100;
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(percent);
  return `${formatted} %`;
}

/**
 * Convert a marže display/input value (e.g. "22" or "22,5") to storage decimal (0.22 or 0.225).
 * Returns the string to store in DB.
 */
export function marzeInputToStorage(input: string): string | null {
  if (!input || input.trim() === "") return null;
  const cleaned = input.replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return String(num / 100);
}

/**
 * Convert stored marže decimal (e.g. "0.22") to input display number (e.g. "22").
 */
export function marzeStorageToInput(stored: string | null | undefined): string {
  if (!stored || stored === "") return "";
  const num = parseFloat(String(stored).replace(",", "."));
  if (isNaN(num)) return "";
  const percent = num * 100;
  return String(Math.round(percent * 100) / 100);
}

/**
 * Convert production CZK (hours × hourly_rate) to selling price including margin.
 * Formula: selling = (productionCzk / (productionPct / 100)) × (1 + maržeDecimal)
 * Falls back to productionCzk if data is missing.
 */
export function productionCzkToSellingPrice(
  productionCzk: number,
  costProductionPct: number | null | undefined,
  marze: string | number | null | undefined,
): number {
  if (!productionCzk || productionCzk <= 0) return 0;

  let marzeDecimal = 0;
  if (marze != null && marze !== "") {
    const parsed = typeof marze === "string" ? parseFloat(marze.replace(",", ".")) : marze;
    if (!isNaN(parsed)) marzeDecimal = parsed;
  }

  if (costProductionPct && costProductionPct > 0) {
    const totalCosts = productionCzk / (costProductionPct / 100);
    return totalCosts * (1 + marzeDecimal);
  }

  return productionCzk * (1 + marzeDecimal);
}
