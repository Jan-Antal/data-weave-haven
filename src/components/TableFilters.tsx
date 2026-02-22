import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, ChevronDown } from "lucide-react";
import { useAllPeople } from "@/hooks/usePeople";
import { statusOrder } from "@/data/projects";
import { cn } from "@/lib/utils";

interface TableFiltersProps {
  personFilter: string | null;
  onPersonFilterChange: (value: string | null) => void;
  statusFilter: string[];
  onStatusFilterChange: (values: string[]) => void;
}

const defaultHiddenStatuses = ["Dokončeno", "Fakturace"];

export function useTableFilters() {
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>(
    statusOrder.filter((s) => !defaultHiddenStatuses.includes(s))
  );

  const hasActiveFilters = personFilter !== null || statusFilter.length !== statusOrder.length;

  const clearFilters = () => {
    setPersonFilter(null);
    setStatusFilter([...statusOrder]);
  };

  return {
    personFilter,
    setPersonFilter,
    statusFilter,
    setStatusFilter,
    hasActiveFilters,
    clearFilters,
  };
}

function PersonFilterDropdown({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { data: people = [] } = useAllPeople();
  const uniqueNames = [...new Set(people.map((p) => p.name))].sort();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = uniqueNames.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-sm w-[180px] justify-between">
          <span className="truncate">{value ?? "Všechny osoby"}</span>
          <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat osobu..."
          className="h-7 text-xs mb-1"
        />
        <div className="max-h-[250px] overflow-y-auto">
          <div
            className={cn(
              "px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground",
              value === null && "bg-accent text-accent-foreground"
            )}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Všechny osoby
          </div>
          {filtered.map((name) => (
            <div
              key={name}
              className={cn(
                "px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground",
                name === value && "bg-accent text-accent-foreground"
              )}
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TableFilters({ personFilter, onPersonFilterChange, statusFilter, onStatusFilterChange }: TableFiltersProps) {
  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter((s) => s !== status));
    } else {
      onStatusFilterChange([...statusFilter, status]);
    }
  };

  const hasActiveFilters = personFilter !== null || statusFilter.length !== statusOrder.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <PersonFilterDropdown value={personFilter} onChange={onPersonFilterChange} />

      {/* Status multi-select as badges */}
      <div className="flex items-center gap-1 flex-wrap">
        {statusOrder.map((status) => {
          const active = statusFilter.includes(status);
          return (
            <Badge
              key={status}
              variant={active ? "default" : "outline"}
              className={`cursor-pointer text-xs select-none ${active ? "bg-primary text-primary-foreground" : "opacity-50"}`}
              onClick={() => toggleStatus(status)}
            >
              {status}
            </Badge>
          );
        })}
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            onPersonFilterChange(null);
            onStatusFilterChange([...statusOrder]);
          }}
        >
          <X className="h-3 w-3 mr-1" /> Zrušit filtry
        </Button>
      )}
    </div>
  );
}
