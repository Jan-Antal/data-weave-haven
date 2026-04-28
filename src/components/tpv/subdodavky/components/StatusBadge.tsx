/**
 * StatusBadge — pill showing subcontract or RFQ request stav.
 * Uses pre-mapped Tailwind classes from helpers.
 */

import { cn } from "@/lib/utils";
import {
  STAV_LABELS,
  STAV_BADGE_CLASSES,
  REQUEST_STAV_LABELS,
  REQUEST_STAV_BADGE_CLASSES,
} from "../helpers";
import type { SubcontractStav, RequestStav } from "../types";

interface SubcontractStatusBadgeProps {
  stav: SubcontractStav;
  className?: string;
}

export function SubcontractStatusBadge({
  stav,
  className,
}: SubcontractStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        STAV_BADGE_CLASSES[stav],
        className
      )}
    >
      {STAV_LABELS[stav]}
    </span>
  );
}

interface RequestStatusBadgeProps {
  stav: RequestStav;
  className?: string;
}

export function RequestStatusBadge({
  stav,
  className,
}: RequestStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        REQUEST_STAV_BADGE_CLASSES[stav],
        className
      )}
    >
      {REQUEST_STAV_LABELS[stav]}
    </span>
  );
}

/**
 * Type pill A/B — free-issue vs buy-finished.
 */
interface TypePillProps {
  type: "A" | "B";
  className?: string;
}

export function TypePill({ type, className }: TypePillProps) {
  const colorClass =
    type === "A"
      ? "bg-blue-100 text-blue-800"
      : "bg-purple-100 text-purple-800";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-5 rounded text-[11px] font-bold font-mono",
        colorClass,
        className
      )}
      title={
        type === "A"
          ? "Free-issue (posielame materiál)"
          : "Buy-finished (kupujeme hotové)"
      }
    >
      {type}
    </span>
  );
}
