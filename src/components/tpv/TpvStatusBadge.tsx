import { READINESS_BG, READINESS_FG, READINESS_LABEL, type ReadinessStatus } from "@/lib/tpvReadiness";

interface Props {
  status: ReadinessStatus;
  className?: string;
}

export function TpvStatusBadge({ status, className }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${className ?? ""}`}
      style={{
        backgroundColor: READINESS_BG[status],
        color: READINESS_FG[status],
        letterSpacing: "0.06em",
      }}
    >
      {READINESS_LABEL[status]}
    </span>
  );
}
