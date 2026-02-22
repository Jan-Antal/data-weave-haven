/**
 * Format monetary value with proper Czech formatting.
 * CZK: "1 234 567,50 Kč"
 * EUR: "12 345,50 €"
 */
export function formatCurrency(value: number | null, currency: string = "CZK"): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "—";

  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  if (currency === "EUR") return `${formatted} €`;
  return `${formatted} Kč`;
}
