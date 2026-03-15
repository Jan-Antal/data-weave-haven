import { useState, useMemo, useCallback, useRef } from "react";
import { MobileProjectCard } from "./MobileProjectCard";
import { MobileFilterChips } from "./MobileFilterChips";
import { MobileStageDetailSheet } from "./MobileStageDetailSheet";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useStagesByProject } from "@/hooks/useAllProjectStages";
import { useProjectAttention } from "@/hooks/useProjectAttention";
import type { ProjectStage } from "@/hooks/useProjectStages";
import { useAuth } from "@/hooks/useAuth";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X, ChevronDown, Check } from "lucide-react";

interface MobileCardListProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight: RiskHighlightType;
  activeTab: string;
  onProjectTap: (project: Project) => void;
  onOpenTPV?: (project: Project) => void;
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

export function MobileCardList({ personFilter, statusFilter, search, riskHighlight, activeTab, onProjectTap, onOpenTPV }: MobileCardListProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { stagesByProject } = useStagesByProject();
  const { profile, linkedPersonName } = useAuth();
  const pmName = linkedPersonName || null;
  const { urgencyMap } = useProjectAttention(pmName);
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("project_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [activeChip, setActiveChip] = useState("active");
  const [localSearch, setLocalSearch] = useState("");
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Stage detail sheet state
  const [selectedStage, setSelectedStage] = useState<ProjectStage | null>(null);
  const [stageSheetOpen, setStageSheetOpen] = useState(false);

  const handleStageTap = useCallback((stage: any) => {
    setSelectedStage(stage as ProjectStage);
    setStageSheetOpen(true);
  }, []);

  // Apply chip filter
  const chipFiltered = useMemo(() => {
    let filtered = projects;
    switch (activeChip) {
      case "attention":
        filtered = projects.filter(p => urgencyMap.has(p.project_id));
        break;
      case "mine":
        if (pmName) filtered = projects.filter(p => p.pm === pmName);
        break;
      case "active":
        filtered = projects.filter(p => p.status !== "Dokončeno");
        break;
      case "everything":
        break;
      default:
        filtered = projects.filter(p => p.status === activeChip);
        break;
    }
    return filtered;
  }, [projects, activeChip, urgencyMap, pmName]);

  // Apply search
  const searchFiltered = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    if (!q) return chipFiltered;
    return chipFiltered.filter(p => {
      const fields = [
        p.project_id, p.project_name, p.klient, p.pm, p.konstrukter,
        p.kalkulant, p.architekt, p.status, p.risk, p.location,
        p.narocnost, p.pm_poznamka, p.tpv_poznamka,
      ];
      return fields.some(f => f && f.toLowerCase().includes(q));
    });
  }, [chipFiltered, localSearch]);

  const displayProjects = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
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
  }, [searchFiltered, sortBy, sortAsc]);

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || "Název";

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
      await queryClient.invalidateQueries({ queryKey: ["attention-schedule"] });
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
      className="flex flex-col gap-2 pb-20"
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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Hledat projekt..."
          className="pl-8 h-9 text-sm rounded-[10px]"
        />
        {localSearch && (
          <button onClick={() => setLocalSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filter chips row with count + sort pill */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground shrink-0">{displayProjects.length}</span>
            <MobileFilterChips activeChip={activeChip} onChipChange={setActiveChip} />
          </div>
        </div>
        <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-card text-foreground min-h-[28px]"
            >
              {currentSortLabel} {sortAsc ? "↑" : "↓"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[160px] p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (sortBy === opt.value) {
                    setSortAsc(v => !v);
                  } else {
                    setSortBy(opt.value);
                    setSortAsc(true);
                  }
                  setSortPopoverOpen(false);
                }}
                className="flex items-center justify-between w-full px-3 py-2 text-[12px] rounded-md hover:bg-accent transition-colors"
              >
                <span>{opt.label}</span>
                {sortBy === opt.value && (
                  <span className="text-primary text-[11px] font-medium">{sortAsc ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Cards */}
      {displayProjects.map((project) => (
        <MobileProjectCard
          key={project.id}
          project={project}
          onTap={onProjectTap}
          onOpenTPV={onOpenTPV}
          onStageTap={handleStageTap}
          stages={stagesByProject.get(project.project_id) || []}
          urgency={urgencyMap.get(project.project_id) || null}
        />
      ))}

      {displayProjects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Žádné výsledky
        </div>
      )}

      <MobileStageDetailSheet
        stage={selectedStage}
        open={stageSheetOpen}
        onOpenChange={setStageSheetOpen}
      />
    </div>
  );
}
