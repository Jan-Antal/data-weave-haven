import type { ProjectProgress } from "@/hooks/useProductionProgress";

interface Props {
  progress: ProjectProgress;
  compact?: boolean;
}

export function ProjectProgressBar({ progress, compact }: Props) {
  const total = progress.in_inbox + progress.scheduled + progress.completed + (progress.paused || 0) + progress.missing;
  if (total === 0) return null;

  const pctCompleted = (progress.completed / total) * 100;
  const pctScheduled = (progress.scheduled / total) * 100;
  const pctPaused = ((progress.paused || 0) / total) * 100;
  const pctInbox = (progress.in_inbox / total) * 100;
  const pctMissing = (progress.missing / total) * 100;

  const accountedFor = progress.completed + progress.scheduled + progress.in_inbox + (progress.paused || 0);

  const hasActivity = progress.completed > 0 || progress.scheduled > 0 || (progress.paused || 0) > 0 || progress.missing > 0;
  const stillInTpv = progress.total_tpv - (progress.completed + progress.scheduled + progress.in_inbox + (progress.paused || 0));
  const tpvCount = Math.max(0, stillInTpv);

  return (
    <div className="w-full">
      {!compact && (
        <div className="flex items-center justify-between mb-[2px]">
          <span className="text-[9px] font-sans" style={{ color: "#6b7a78" }}>{accountedFor}/{total}</span>
        </div>
      )}
      <div className="h-[4px] w-full rounded-full overflow-hidden flex" style={{ backgroundColor: "#d1d5db" }}>
        {pctCompleted > 0 && <div className="h-full" style={{ width: `${pctCompleted}%`, backgroundColor: "#6aab68" }} />}
        {pctScheduled > 0 && <div className="h-full" style={{ width: `${pctScheduled}%`, backgroundColor: "#a8d5a6" }} />}
        {pctPaused > 0 && <div className="h-full" style={{ width: `${pctPaused}%`, backgroundColor: "#e0c97a" }} />}
        {pctInbox > 0 && <div className="h-full" style={{ width: `${pctInbox}%`, backgroundColor: "#c4bfb8" }} />}
        {pctMissing > 0 && <div className="h-full" style={{ width: `${pctMissing}%`, backgroundColor: "#d4908e" }} />}
      </div>
      <div className="flex gap-2 mt-1 text-[10px] leading-none">
          {tpvCount > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#8a8578" }}>
              <span>◇</span>
              <span>{tpvCount} v TPV</span>
            </span>
          )}
          {tpvCount === 0 && progress.missing === 0 && total > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#3a8a36" }}>
              <span>✓</span>
              <span>vše přijato</span>
            </span>
          )}
          {progress.completed > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#3a8a36", fontWeight: 500 }}>
              <span>✓</span>
              <span>{progress.completed} hotovo</span>
            </span>
          )}
          {progress.scheduled > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#6b7280", fontWeight: 500 }}>
              <span>⊙</span>
              <span>{progress.scheduled} plán</span>
            </span>
          )}
          {(progress.paused || 0) > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#b8a44a" }}>
              <span>⏸</span>
              <span>{progress.paused} pauza</span>
            </span>
          )}
          {progress.missing > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: "#d4908e" }}>
              <span>⚠</span>
              <span>{progress.missing} chybí</span>
            </span>
          )}
        </div>
    </div>
  );
}
