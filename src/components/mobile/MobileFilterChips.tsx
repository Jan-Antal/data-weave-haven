import { useMemo } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useProjectAttention } from "@/hooks/useProjectAttention";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { isTerminalStatus } from "@/lib/statusHelpers";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface MobileFilterChipsProps {
  activeChip: string;
  onChipChange: (chip: string) => void;
}

export function MobileFilterChips({ activeChip, onChipChange }: MobileFilterChipsProps) {
  const { data: projects = [] } = useProjects();
  const { linkedPersonName } = useAuth();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const pmName = linkedPersonName || null;
  const { urgencyMap } = useProjectAttention(pmName);

  const STATUS_CHIPS = useMemo(() =>
    statusOptions
      .filter(s => !isTerminalStatus(s.label, statusOptions))
      .map(s => ({ value: s.label, label: s.label })),
    [statusOptions]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      everything: projects.length,
      active: 0,
      attention: 0,
      mine: 0,
    };
    for (const p of projects) {
      if (urgencyMap.has(p.project_id)) c.attention++;
      if (pmName && p.pm === pmName) c.mine++;
      const s = p.status;
      if (s) c[s] = (c[s] || 0) + 1;
      if (!isTerminalStatus(s, statusOptions)) c.active++;
    }
    return c;
  }, [projects, urgencyMap, pmName]);

  const chips = [
    { value: "attention", label: `⚠ Pozornost (${counts.attention})` },
    { value: "mine", label: `Moje (${counts.mine})` },
    { value: "active", label: `Aktivní (${counts.active})` },
    ...STATUS_CHIPS.map(sc => ({
      value: sc.value,
      label: `${sc.label}${counts[sc.value] ? ` (${counts[sc.value]})` : ""}`,
    })),
    { value: "everything", label: `Vše (${counts.everything})` },
  ];

  return (
    <div className="flex overflow-x-auto gap-2 scrollbar-hide py-1">
      {chips.map(chip => (
        <button
          key={chip.value}
          onClick={() => onChipChange(chip.value)}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[32px] whitespace-nowrap",
            activeChip === chip.value
              ? "text-primary-foreground border-transparent"
              : "bg-background text-foreground border-border hover:bg-accent"
          )}
          style={activeChip === chip.value ? { backgroundColor: "#223937" } : undefined}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
