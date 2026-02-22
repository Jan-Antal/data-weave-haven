import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

// "Bez statusu" is a virtual filter option
const BEZ_STATUSU = "__bez_statusu__";

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

function StatusFilterDropdown({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const allOptions = [...statusOrder, BEZ_STATUSU];
  const filtered = allOptions.filter((s) => {
    const label = s === BEZ_STATUSU ? "Bez statusu" : s;
    return label.toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const toggle = (status: string) => {
    if (value.includes(status)) {
      onChange(value.filter((s) => s !== status));
    } else {
      onChange([...value, status]);
    }
  };

  const allSelected = value.length === allOptions.length;
  const label = allSelected ? "Všechny statusy" : `Status (${value.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-sm w-[180px] justify-between">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1" align="start">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat status..."
          className="h-7 text-xs mb-1"
        />
        <div className="max-h-[250px] overflow-y-auto">
          {filtered.map((status) => (
            <div
              key={status}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggle(status)}
            >
              <Checkbox
                checked={value.includes(status)}
                onCheckedChange={() => toggle(status)}
                className="h-3.5 w-3.5"
              />
              <span>{status === BEZ_STATUSU ? "Bez statusu" : status}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t mt-1 pt-1 px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs flex-1"
            onClick={() => onChange([...allOptions])}
          >
            Vybrat vše
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs flex-1"
            onClick={() => onChange([])}
          >
            Zrušit vše
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TableFilters({ personFilter, onPersonFilterChange, statusFilter, onStatusFilterChange }: TableFiltersProps) {
  const hasActiveFilters = personFilter !== null || statusFilter.length !== statusOrder.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <PersonFilterDropdown value={personFilter} onChange={onPersonFilterChange} />
      <StatusFilterDropdown value={statusFilter} onChange={onStatusFilterChange} />

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

export { BEZ_STATUSU };
