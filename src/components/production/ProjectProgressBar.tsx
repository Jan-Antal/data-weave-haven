import type { ProjectProgress } from "@/hooks/useProductionProgress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full">
          {!compact && (
            <div className="flex items-center justify-between mb-[2px]">
              <span className="text-[9px] font-mono" style={{ color: "#6b7a78" }}>{accountedFor}/{total}</span>
            </div>
          )}
          <div className="h-[4px] w-full rounded-full overflow-hidden flex" style={{ backgroundColor: "#e8e5e0" }}>
            {pctCompleted > 0 && <div className="h-full" style={{ width: `${pctCompleted}%`, backgroundColor: "#6aab68" }} />}
            {pctScheduled > 0 && <div className="h-full" style={{ width: `${pctScheduled}%`, backgroundColor: "#a8d5a6" }} />}
            {pctPaused > 0 && <div className="h-full" style={{ width: `${pctPaused}%`, backgroundColor: "#e0c97a" }} />}
            {pctInbox > 0 && <div className="h-full" style={{ width: `${pctInbox}%`, backgroundColor: "#c4bfb8" }} />}
            {pctMissing > 0 && <div className="h-full" style={{ width: `${pctMissing}%`, backgroundColor: "#d4908e" }} />}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-[10px] space-y-0.5">
        <div style={{ color: "#6aab68" }}>✓ Dokončeno: {progress.completed}</div>
        <div style={{ color: "#a8d5a6" }}>📅 Naplánováno: {progress.scheduled}</div>
        {(progress.paused || 0) > 0 && <div style={{ color: "#b8a44a" }}>⏸ Pozastaveno: {progress.paused}</div>}
        <div style={{ color: "#9b9690" }}>📥 V Inboxu: {progress.in_inbox}</div>
        {progress.missing > 0 && <div style={{ color: "#d4908e" }}>⚠ Chybí: {progress.missing}</div>}
        <div className="text-muted-foreground pt-0.5 border-t" style={{ borderColor: "#e2ddd6" }}>TPV celkem: {progress.total_tpv}</div>
      </TooltipContent>
    </Tooltip>
  );
}
