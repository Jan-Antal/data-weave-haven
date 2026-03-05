import { useState, useMemo } from "react";
import { Filter, X, Search, ChevronDown, ChevronUp, User, Tag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { usePeople } from "@/hooks/usePeople";
import { useProjects } from "@/hooks/useProjects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { getStatusFilterOptionValues, getStatusFilterLabel, EMPTY_STATUS_FILTER_VALUE } from "@/lib/statusFilter";
import { cn } from "@/lib/utils";

interface MobileFilterSheetProps {
  personFilter: string | null;
  onPersonFilterChange: (v: string | null) => void;
  statusFilter: string[];
  onStatusFilterChange: (v: string[]) => void;
  search: string;
  onSearchChange: (v: string) => void;
  hasActiveFilters: boolean;
}

export function MobileFilterSheet({
  personFilter,
  onPersonFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  hasActiveFilters,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const { data: pmPeople = [] } = usePeople("PM");
  const { data: projects = [] } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();

  const [personExpanded, setPersonExpanded] = useState(false);
  const [statusExpanded, setStatusExpanded] = useState(false);

  // Draft state so changes only apply on "Použít"
  const [draftPerson, setDraftPerson] = useState<string | null>(personFilter);
  const [draftStatus, setDraftStatus] = useState<string[]>(statusFilter);

  const pmNames = useMemo(() => [...new Set(pmPeople.map((p) => p.name))].sort(), [pmPeople]);
  const statusValues = getStatusFilterOptionValues(statusOptions.map((s) => s.label));

  // Count projects per PM
  const pmCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      if (p.pm) {
        counts[p.pm] = (counts[p.pm] || 0) + 1;
      }
    }
    return counts;
  }, [projects]);

  // Count projects per status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      const key = !p.status || p.status.trim() === "" ? EMPTY_STATUS_FILTER_VALUE : p.status;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [projects]);

  // Status color map
  const statusColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const opt of statusOptions) {
      map[opt.label] = opt.color;
    }
    return map;
  }, [statusOptions]);

  // Active filter count
  const activeCount = useMemo(() => {
    let count = 0;
    if (draftPerson) count++;
    if (draftStatus.length !== statusValues.length) count++;
    return count;
  }, [draftPerson, draftStatus, statusValues]);

  const hasChanges = draftPerson !== personFilter ||
    JSON.stringify([...draftStatus].sort()) !== JSON.stringify([...statusFilter].sort());

  const toggleDraftStatus = (v: string) => {
    setDraftStatus((prev) =>
      prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]
    );
  };

  const handleApply = () => {
    onPersonFilterChange(draftPerson);
    onStatusFilterChange(draftStatus);
    setOpen(false);
  };

  const handleReset = () => {
    setDraftPerson(null);
    setDraftStatus([...statusValues]);
  };

  // Sync draft state when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setDraftPerson(personFilter);
      setDraftStatus(statusFilter);
    }
    setOpen(v);
  };

  return (
    <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className="flex-1 relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Hledat projekt..."
          className="pl-8 h-9 text-sm"
        />
        {search && (
          <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className={cn("h-9 w-9 shrink-0 relative", hasActiveFilters && "border-primary text-primary")}>
            <Filter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-bold">
                {(personFilter ? 1 : 0) + (statusFilter.length !== statusValues.length ? 1 : 0)}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Filtry</SheetTitle>
          </SheetHeader>

          <div className="overflow-y-auto flex-1 mt-2">
            {/* ── Person Section ── */}
            <div className="border-b" style={{ borderColor: "#e2ddd6" }}>
              <button
                onClick={() => setPersonExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
              >
                <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "#223937" }}>
                  <User className="h-4 w-4" />
                  Osoba
                  {!personExpanded && draftPerson && (
                    <span className="font-normal text-muted-foreground ml-1">: {draftPerson}</span>
                  )}
                </span>
                {personExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  personExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="px-4 pb-3 space-y-0.5">
                  <button
                    onClick={() => setDraftPerson(null)}
                    className={cn(
                      "w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors",
                      !draftPerson && "font-medium"
                    )}
                    style={!draftPerson ? { backgroundColor: "#22393710", color: "#223937" } : undefined}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      !draftPerson ? "border-[#223937]" : "border-muted-foreground/40"
                    )}>
                      {!draftPerson && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#223937" }} />}
                    </div>
                    Všechny osoby
                  </button>
                  {pmNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => setDraftPerson(name)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm min-h-[44px] transition-colors",
                        name === draftPerson && "font-medium"
                      )}
                      style={name === draftPerson ? { backgroundColor: "#22393710", color: "#223937" } : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <div className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          name === draftPerson ? "border-[#223937]" : "border-muted-foreground/40"
                        )}>
                          {name === draftPerson && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#223937" }} />}
                        </div>
                        {name}
                      </span>
                      {pmCounts[name] != null && (
                        <span className="text-xs text-muted-foreground">({pmCounts[name]})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Status Section ── */}
            <div className="border-b" style={{ borderColor: "#e2ddd6" }}>
              <button
                onClick={() => setStatusExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
              >
                <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "#223937" }}>
                  <Tag className="h-4 w-4" />
                  Status
                  {!statusExpanded && (
                    <span className="font-normal text-muted-foreground ml-1">
                      : {draftStatus.length === statusValues.length ? "Vše" : `${draftStatus.length} vybráno`}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {statusExpanded && (
                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); setDraftStatus([...statusValues]); }}
                      >
                        Vše
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); setDraftStatus([]); }}
                      >
                        Nic
                      </button>
                    </span>
                  )}
                  {statusExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
              </button>

              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  statusExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="px-4 pb-3 space-y-0.5">
                  {statusValues.map((sv) => {
                    const label = getStatusFilterLabel(sv);
                    const color = sv !== EMPTY_STATUS_FILTER_VALUE ? statusColorMap[sv] : undefined;
                    const count = statusCounts[sv] || 0;
                    return (
                      <button
                        key={sv}
                        onClick={() => toggleDraftStatus(sv)}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm min-h-[44px] hover:bg-muted/50 transition-colors"
                      >
                        <span className="flex items-center gap-3">
                          <Checkbox
                            checked={draftStatus.includes(sv)}
                            onCheckedChange={() => toggleDraftStatus(sv)}
                            className="h-4 w-4"
                          />
                          {color ? (
                            <Badge
                              variant="outline"
                              className="text-xs font-medium"
                              style={{ backgroundColor: `${color}20`, color, borderColor: `${color}50` }}
                            >
                              {label}
                            </Badge>
                          ) : (
                            <span>{label}</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="border-t pt-3 mt-auto px-4 pb-4 space-y-2">
            <Button
              className="w-full min-h-[48px] text-sm font-medium"
              onClick={handleApply}
            >
              {activeCount > 0
                ? `Použít filtry (${activeCount} aktivní)`
                : hasChanges
                  ? "Použít filtry"
                  : "Zavřít"}
            </Button>
            {(draftPerson || draftStatus.length !== statusValues.length) && (
              <button
                onClick={handleReset}
                className="w-full text-center text-xs text-muted-foreground hover:underline py-1"
              >
                Zrušit filtry
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
