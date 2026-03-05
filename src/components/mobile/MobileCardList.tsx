import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { MobileProjectCard } from "./MobileProjectCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useStagesByProject } from "@/hooks/useAllProjectStages";
import { useSortFilter } from "@/hooks/useSortFilter";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";

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

const PULL_THRESHOLD = 60;
const MIN_SPINNER_MS = 500;

export function MobileCardList({ personFilter, statusFilter, search, riskHighlight, activeTab, onProjectTap }: MobileCardListProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { stagesByProject } = useStagesByProject();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("project_name");
  const [sortAsc, setSortAsc] = useState(true);
  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const externalFilters = useMemo(() => ({
    personFilter,
    statusFilter,
  }), [personFilter, statusFilter]);

  const { sorted } = useSortFilter(projects, externalFilters, search);

  const displayProjects = useMemo(() => {
    return [...sorted].sort((a, b) => {
      const av = (a as any)[sortBy] ?? "";
      const bv = (b as any)[sortBy] ?? "";
      let cmp: number;
      if (sortBy === "prodejni_cena") {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av).localeCompare(String(bv), "cs");
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [sorted, sortBy, sortAsc]);

  // Pull-to-refresh touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    touchStartY.current = e.touches[0].clientY;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const container = containerRef.current?.closest("main");
    if (!container || container.scrollTop > 5) return;
    
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 0) {
      setPullDistance(Math.min(deltaY * 0.5, 100));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (refreshing) return;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      const start = Date.now();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      const elapsed = Date.now() - start;
      if (elapsed < MIN_SPINNER_MS) {
        await new Promise(r => setTimeout(r, MIN_SPINNER_MS - elapsed));
      }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, refreshing, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2 pb-16"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: refreshing ? 40 : pullDistance * 0.6 }}
        >
          <Loader2
            className="h-5 w-5 text-primary"
            style={{
              opacity: refreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
              animation: refreshing ? "spin 1s linear infinite" : "none",
              transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
            }}
          />
        </div>
      )}

      {/* Sort control */}
      <div className="flex items-center justify-between px-1 gap-2">
        <span className="text-xs text-muted-foreground shrink-0">{displayProjects.length} projektů</span>
        <div className="flex items-center gap-1">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[110px] h-8 text-xs">
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
        <button
          onClick={() => setSortAsc(v => !v)}
          className="h-8 w-8 flex items-center justify-center rounded-md border border-border shrink-0"
          style={{ color: "#223937" }}
          title={sortAsc ? "Vzestupně" : "Sestupně"}
        >
          {sortAsc ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </button>
        </div>
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
