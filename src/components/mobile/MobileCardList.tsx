import { useState, useMemo, useCallback } from "react";
import { MobileProjectCard } from "./MobileProjectCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useStagesByProject } from "@/hooks/useAllProjectStages";
import { useSortFilter } from "@/hooks/useSortFilter";
import { matchesStatusFilter, normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";

interface MobileCardListProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight: RiskHighlightType;
  activeTab: string;
  onProjectTap: (project: Project) => void;
}

const SORT_OPTIONS = [
  { value: "project_name", label: "Název" },
  { value: "status", label: "Status" },
  { value: "datum_smluvni", label: "Datum" },
  { value: "pm", label: "PM" },
  { value: "prodejni_cena", label: "Cena" },
];

export function MobileCardList({ personFilter, statusFilter, search, riskHighlight, activeTab, onProjectTap }: MobileCardListProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { stagesByProject } = useStagesByProject();
  const [sortBy, setSortBy] = useState("project_name");

  const externalFilters = useMemo(() => ({
    personFilter,
    statusFilter,
  }), [personFilter, statusFilter]);

  const { sorted } = useSortFilter(projects, externalFilters, search);

  // Apply sorting
  const displayProjects = useMemo(() => {
    return [...sorted].sort((a, b) => {
      const av = (a as any)[sortBy] ?? "";
      const bv = (b as any)[sortBy] ?? "";
      if (sortBy === "prodejni_cena") {
        return (Number(bv) || 0) - (Number(av) || 0);
      }
      return String(av).localeCompare(String(bv), "cs");
    });
  }, [sorted, sortBy]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-16">
      {/* Sort control */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">{displayProjects.length} projektů</span>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Řadit dle" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      {displayProjects.map((project) => (
        <MobileProjectCard
          key={project.id}
          project={project}
          onTap={onProjectTap}
          stages={stagesByProject.get(project.project_id) || []}
        />
      ))}

      {displayProjects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Žádné výsledky
        </div>
      )}
    </div>
  );
}
