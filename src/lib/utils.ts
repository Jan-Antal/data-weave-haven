import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Round hours to 1 decimal place (avoids floating-point artifacts like 0.7000000000000002).
 * Used uniformly across the app for both display and calculations.
 */
export function roundHours(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/** Format hours for display: rounded to 1 decimal, trailing .0 stripped. */
export function formatHours(value: number | null | undefined): string {
  const r = roundHours(value);
  return Number.isInteger(r) ? r.toString() : r.toFixed(1);
}
