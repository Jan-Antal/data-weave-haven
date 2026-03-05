import { useState } from "react";
import { Filter, X, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAllPeople } from "@/hooks/usePeople";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { getStatusFilterOptionValues, getStatusFilterLabel } from "@/lib/statusFilter";
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
  const { data: people = [] } = useAllPeople();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const uniqueNames = [...new Set(people.map((p) => p.name))].sort();
  const statusValues = getStatusFilterOptionValues(statusOptions.map((s) => s.label));

  const toggleStatus = (v: string) => {
    if (statusFilter.includes(v)) {
      onStatusFilterChange(statusFilter.filter((s) => s !== v));
    } else {
      onStatusFilterChange([...statusFilter, v]);
    }
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
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className={cn("h-9 w-9 shrink-0", hasActiveFilters && "border-primary text-primary")}>
            <Filter className="h-4 w-4" />
            {hasActiveFilters && <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filtry</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto flex-1 mt-4 space-y-6">
            {/* Person filter */}
            <div>
              <h3 className="text-sm font-medium mb-2">Osoba</h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                <button
                  onClick={() => onPersonFilterChange(null)}
                  className={cn("w-full text-left px-3 py-2.5 rounded-md text-sm min-h-[44px]", !personFilter && "bg-primary/10 text-primary font-medium")}
                >
                  Všechny osoby
                </button>
                {uniqueNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => onPersonFilterChange(name)}
                    className={cn("w-full text-left px-3 py-2.5 rounded-md text-sm min-h-[44px]", name === personFilter && "bg-primary/10 text-primary font-medium")}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            {/* Status filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Status</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onStatusFilterChange([...statusValues])}>
                    Vše
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onStatusFilterChange([])}>
                    Nic
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                {statusValues.map((sv) => (
                  <button
                    key={sv}
                    onClick={() => toggleStatus(sv)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm min-h-[44px]"
                  >
                    <Checkbox checked={statusFilter.includes(sv)} onCheckedChange={() => toggleStatus(sv)} className="h-4 w-4" />
                    <span>{getStatusFilterLabel(sv)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t pt-3 mt-3 flex gap-2">
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => { onPersonFilterChange(null); onStatusFilterChange([...statusValues]); }}>
              Zrušit filtry
            </Button>
            <Button className="flex-1 min-h-[44px]" onClick={() => setOpen(false)}>
              Použít
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
