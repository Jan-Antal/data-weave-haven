/**
 * MaterialStatusBadge — workflow stav visualization.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Inbox,
  Sparkles,
  ShoppingCart,
  Truck,
  Package,
} from "lucide-react";

import type { MaterialStav } from "../types";
import { STAV_LABEL } from "../types";

interface MaterialStatusBadgeProps {
  stav: MaterialStav;
  size?: "sm" | "md";
  className?: string;
}

export function MaterialStatusBadge({
  stav,
  size = "md",
  className,
}: MaterialStatusBadgeProps) {
  const Icon =
    stav === "extracted"
      ? Sparkles
      : stav === "needs_review"
        ? Eye
        : stav === "confirmed"
          ? ClipboardCheck
          : stav === "sampling"
            ? Inbox
            : stav === "sample_ok"
              ? CheckCircle2
              : stav === "specified"
                ? ClipboardCheck
                : stav === "ordering"
                  ? Clock
                  : stav === "ordered"
                    ? ShoppingCart
                    : stav === "delivered"
                      ? Package
                      : Truck;

  const tone =
    stav === "delivered"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : stav === "sample_ok"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
        : stav === "ordered"
          ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
          : stav === "ordering"
            ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
            : stav === "needs_review"
              ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
              : stav === "sampling"
                ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                : stav === "extracted"
                  ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                  : stav === "confirmed" || stav === "specified"
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        tone,
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {STAV_LABEL[stav]}
    </Badge>
  );
}
