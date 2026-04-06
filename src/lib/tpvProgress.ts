import type { TPVItem } from "@/hooks/useTPVItems";

/**
 * Status → weight mapping for TPV progress calculation.
 * Keys are lowercase for case-insensitive matching.
 */
const STATUS_WEIGHT: Record<string, number> = {
  "chybějící podklady": 0,
  "chybejici podklady": 0,
  "čeká na zaměření": 0,
  "ceka na zamereni": 0,
  "připraveno ke zpracování": 10,
  "pripraveno ke zpracovani": 10,
  "zpracovává se": 40,
  "zpracovava se": 40,
  "odesláno ke schválení": 65,
  "odeslano ke schvaleni": 65,
  "připomínky ke zpracování": 75,
  "pripominky ke zpracovani": 75,
  "revize odeslána ke schválení": 90,
  "revize odeslana ke schvaleni": 90,
  "schváleno": 100,
  "schvaleno": 100,
};

/** Get weight for a TPV item status (case-insensitive). Returns 0 for unknown statuses. */
export function getStatusWeight(status: string | null | undefined): number {
  if (!status) return 0;
  return STATUS_WEIGHT[status.toLowerCase().trim()] ?? 0;
}

/**
 * Compute TPV progress as average of item status weights.
 * Returns rounded percentage (0–100) or null if no items.
 */
export function computeTPVProgress(items: TPVItem[]): number | null {
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + getStatusWeight(item.status), 0);
  return Math.round(total / items.length);
}
