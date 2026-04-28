/**
 * Subdodávky — subcontract-specific helpers.
 *
 * Generic helpers (formatMoney, formatDate, computePermissions, daysUntil)
 * live in shared/helpers.ts. We re-export them here for convenience so
 * components in this tab can `import {...} from "../helpers"`.
 */

import type {
  SubcontractView,
  ProjectSubcontractGroup,
  SubcontractStav,
  RequestStav,
} from "./types";
import { SUBCONTRACT_STAV } from "./types";
import type { TpvSupplierRow } from "../shared/types";

// Re-export generic helpers from shared/ so existing component imports
// of e.g. formatMoney from "../helpers" keep working.
export {
  formatMoney,
  formatMoneyCompact,
  formatDateShort,
  formatDateLong,
  daysUntil,
  relativeTime,
} from "../shared/helpers";

// ============================================================
// GROUPING
// ============================================================

/**
 * Group subcontracts by project_id for the "Per projekt" accordion view.
 * Each group includes totals and per-stav counts.
 */
export function groupByProject(
  subcontracts: SubcontractView[]
): ProjectSubcontractGroup[] {
  const map = new Map<string, ProjectSubcontractGroup>();

  for (const sub of subcontracts) {
    if (!sub.project_id) continue;

    let group = map.get(sub.project_id);
    if (!group) {
      group = {
        project: sub.project ?? {
          project_id: sub.project_id,
          project_name: null,
          pm: null,
          konstrukter: null,
          status: null,
          klient: null,
          expedice: null,
          predani: null,
          is_active: true,
        },
        subcontracts: [],
        total_predpokladana: 0,
        total_finalna: 0,
        count_by_stav: {
          navrh: 0,
          rfq: 0,
          ponuka: 0,
          objednane: 0,
          dodane: 0,
          zruseno: 0,
        },
      };
      map.set(sub.project_id, group);
    }

    group.subcontracts.push(sub);
    group.total_predpokladana += Number(sub.cena_predpokladana ?? 0);
    group.total_finalna += Number(sub.cena_finalna ?? 0);
    if (sub.stav in group.count_by_stav) {
      group.count_by_stav[sub.stav]++;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    b.project.project_id.localeCompare(a.project.project_id)
  );
}

/**
 * Group subcontracts by supplier (dodavatel_id) for the "Per dodávateľ" view.
 * Subcontracts without supplier are excluded.
 */
export function groupBySupplier(
  subcontracts: SubcontractView[]
): Map<string, { supplier: TpvSupplierRow; items: SubcontractView[] }> {
  const map = new Map<
    string,
    { supplier: TpvSupplierRow; items: SubcontractView[] }
  >();

  for (const sub of subcontracts) {
    if (!sub.dodavatel_id || !sub.supplier) continue;

    const existing = map.get(sub.dodavatel_id);
    if (existing) {
      existing.items.push(sub);
    } else {
      map.set(sub.dodavatel_id, {
        supplier: sub.supplier,
        items: [sub],
      });
    }
  }

  return map;
}

// ============================================================
// STATUS LABELS / BADGES
// ============================================================

/** Labels for subcontract stav, in Czech (UI language).
 *  DB hodnoty: navrh / rfq / ponuka / objednane / dodane / zruseno. */
export const STAV_LABELS: Record<SubcontractStav, string> = {
  navrh: "Návrh",
  rfq: "Dopyt rozposlaný",
  ponuka: "Ponuka prijatá",
  objednane: "Objednané",
  dodane: "Dodané",
  zruseno: "Zrušené",
};

/** Tailwind classes for stav badges. */
export const STAV_BADGE_CLASSES: Record<SubcontractStav, string> = {
  navrh: "bg-gray-100 text-gray-700",
  rfq: "bg-amber-100 text-amber-800",
  ponuka: "bg-blue-100 text-blue-800",
  objednane: "bg-purple-100 text-purple-800",
  dodane: "bg-green-100 text-green-800",
  zruseno: "bg-red-100 text-red-800",
};

/** DB hodnoty: sent / received / accepted / rejected. */
export const REQUEST_STAV_LABELS: Record<RequestStav, string> = {
  sent: "Čaká na odpoveď",
  received: "Ponuka prijatá",
  accepted: "Víťaz",
  rejected: "Zamietnuté",
};

export const REQUEST_STAV_BADGE_CLASSES: Record<RequestStav, string> = {
  sent: "bg-gray-100 text-gray-700",
  received: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-gray-100 text-gray-500",
};

// ============================================================
// STATUS STRIP — left border color per row
// ============================================================

export type StatusStripColor = "red" | "amber" | "green" | "gray";

export function computeStatusStrip(
  sub: SubcontractView,
  expediceDate?: Date | null
): StatusStripColor {
  const stav = sub.stav;

  if (stav === SUBCONTRACT_STAV.DODANE) return "green";
  if (stav === SUBCONTRACT_STAV.ZRUSENO) return "gray";

  // Overdue check: dodane_dat in past but no actual delivery yet
  if (sub.dodane_dat) {
    const planned = new Date(sub.dodane_dat);
    if (planned.getTime() < Date.now()) {
      return "red";
    }
  }

  if (expediceDate) {
    const msToExpedice = expediceDate.getTime() - Date.now();
    const daysToExpedice = msToExpedice / (1000 * 60 * 60 * 24);
    if (daysToExpedice <= 7) return "red";
    if (daysToExpedice <= 14) return "amber";
  }

  if (stav === SUBCONTRACT_STAV.OBJEDNANE) return "amber";
  if (stav === SUBCONTRACT_STAV.PONUKA) return "amber";
  if (stav === SUBCONTRACT_STAV.RFQ) return "amber";
  if (stav === SUBCONTRACT_STAV.NAVRH) return "gray";

  return "gray";
}

export const STRIP_BORDER_CLASSES: Record<StatusStripColor, string> = {
  red: "border-l-4 border-l-red-500",
  amber: "border-l-4 border-l-amber-500",
  green: "border-l-4 border-l-green-500",
  gray: "border-l-4 border-l-gray-300",
};

// ============================================================
// TYPE A/B CLASSIFICATION
// ============================================================

/** Type A vs B — A = free-issue (we ship material), B = buy-finished. */
export type SubcontractType = "A" | "B";

export function classifyType(sub: SubcontractView): SubcontractType {
  // TODO: add `typ_spoluprace` column to tpv_subcontract for explicit storage.
  const text = `${sub.nazov} ${sub.popis ?? ""}`.toLowerCase();
  if (
    text.includes("sklo") ||
    text.includes("kovani") ||
    text.includes("led") ||
    text.includes("hotov")
  ) {
    return "B";
  }
  return "A";
}
