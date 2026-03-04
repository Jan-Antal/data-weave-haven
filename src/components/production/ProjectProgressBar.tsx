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
            {pctCompleted > 0 && <div className="h-full" style={{ width: `${pctCompleted}%`, backgroundColor: "#5a9a58" }} />}
            {pctScheduled > 0 && <div className="h-full" style={{ width: `${pctScheduled}%`, backgroundColor: "#7bafd4" }} />}
            {pctPaused > 0 && <div className="h-full" style={{ width: `${pctPaused}%`, backgroundColor: "#e0c97a" }} />}
            {pctInbox > 0 && <div className="h-full" style={{ width: `${pctInbox}%`, backgroundColor: "#d4a06a" }} />}
            {pctMissing > 0 && <div className="h-full" style={{ width: `${pctMissing}%`, backgroundColor: "#c9706e" }} />}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-[10px] space-y-0.5">
        <div style={{ color: "#5a9a58" }}>✓ Dokončeno: {progress.completed}</div>
        <div style={{ color: "#7bafd4" }}>📅 Naplánováno: {progress.scheduled}</div>
        {(progress.paused || 0) > 0 && <div style={{ color: "#b8a44a" }}>⏸ Pozastaveno: {progress.paused}</div>}
        <div style={{ color: "#d4a06a" }}>📥 V Inboxu: {progress.in_inbox}</div>
        {progress.missing > 0 && <div style={{ color: "#c9706e" }}>⚠ Chybí: {progress.missing}</div>}
        <div className="text-muted-foreground pt-0.5 border-t" style={{ borderColor: "#e2ddd6" }}>TPV celkem: {progress.total_tpv}</div>
      </TooltipContent>
    </Tooltip>
  );
}
