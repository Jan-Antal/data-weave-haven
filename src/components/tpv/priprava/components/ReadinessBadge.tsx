/**
 * ReadinessBadge — readiness_status visual.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

import type { ReadinessStatus } from "../types";
import { READINESS_LABEL } from "../types";

interface ReadinessBadgeProps {
  status: ReadinessStatus;
  size?: "sm" | "md";
  className?: string;
}

export function ReadinessBadge({
  status,
  size = "md",
  className,
}: ReadinessBadgeProps) {
  const Icon =
    status === "ready"
      ? CheckCircle2
      : status === "rozpracovane"
        ? Clock
        : status === "riziko"
          ? AlertTriangle
          : AlertOctagon;

  const tone =
    status === "ready"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : status === "rozpracovane"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : status === "riziko"
          ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
          : "border-red-500/40 bg-red-500/15 text-red-300";

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
      {READINESS_LABEL[status]}
    </Badge>
  );
}
