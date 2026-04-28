/**
 * Shared TPV module helpers — formatting, permissions, common utilities.
 * Pure functions only — no side effects, no Supabase calls.
 */

import type { AppRole, Mena, TpvPermissions } from "./types";

// ============================================================
// MONEY / DATE FORMATTING
// ============================================================

/** Czech locale money formatter with currency symbol. */
export function formatMoney(
  amount: number | null | undefined,
  mena: Mena = "CZK"
): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: mena,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Compact money — no currency symbol, for tight columns. */
export function formatMoneyCompact(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(
    amount
  );
}

/** ISO date → "20. 4." (compact tables). */
export function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** ISO date → "20. 4. 2026". */
export function formatDateLong(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** Days until/since — positive = future, negative = past. */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Relative-time short label, e.g. "pred 5 min", "pred 2 dňami". */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "pred chvíľou";
  const min = Math.floor(sec / 60);
  if (min < 60) return `pred ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `pred ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `pred ${days} ${days === 1 ? "dňom" : "dňami"}`;
  return formatDateLong(iso);
}

// ============================================================
// PERMISSIONS — derive from app_role
// ============================================================

/**
 * Compute what current user can do across the entire TPV module.
 * Mirrors RLS policies (defense in depth — RLS is authoritative).
 *
 * Reálne roly v DB (overené z app_role enum 26.4.2026):
 *   owner, admin, pm, konstrukter, viewer, tester, vyroba,
 *   vedouci_pm, vedouci_konstrukter, vedouci_vyroby, mistr, quality,
 *   kalkulant, nakupci.
 */
export function computePermissions(roles: AppRole[]): TpvPermissions {
  const has = (...wanted: AppRole[]) => wanted.some((r) => roles.includes(r));

  const isAdmin = has("owner", "admin");
  const isPM = has("pm", "vedouci_pm");
  const isKonstrukter = has("konstrukter", "vedouci_konstrukter");
  const isKalkulant = has("kalkulant");
  const isNakupca = has("nakupci");
  const isVedouciVyroby = has("vedouci_vyroby");
  const isMistr = has("mistr");
  const isViewer = roles.length === 1 && has("viewer");

  return {
    canView: !isViewer ? true : true, // viewers can read everything
    // Subdodávky
    canCreateSubcontract: isAdmin || isPM || isNakupca,
    canEditSubcontract: isAdmin || isPM || isNakupca,
    canDeleteSubcontract: isAdmin || isPM,
    canSendRFQ: isAdmin || isPM || isNakupca,
    canAwardRFQ: isAdmin || isPM, // only PM/admin/owner can award final winner
    // Dodávatelia (CRM)
    canManageSupplier: isAdmin || isPM || isNakupca,
    // Materiál
    canEditMaterial: isAdmin || isPM || isNakupca || isKonstrukter,
    // Hodiny
    canSubmitHours: isAdmin || isPM || isKonstrukter || isKalkulant,
    canApproveHours: isAdmin || isPM || isVedouciVyroby,
    // Príprava
    canEditPreparation: isAdmin || isPM || isKonstrukter || isKalkulant,
  };
}
