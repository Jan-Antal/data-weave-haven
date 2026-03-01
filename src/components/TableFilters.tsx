import React, { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ChevronDown } from "lucide-react";
import { useAllPeople } from "@/hooks/usePeople";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { cn } from "@/lib/utils";
import { TableSearchBar } from "./TableSearchBar";
import { useAuth } from "@/hooks/useAuth";
import { EMPTY_STATUS_FILTER_VALUE, getStatusFilterLabel, getStatusFilterOptionValues } from "@/lib/statusFilter";

interface TableFiltersProps {
  personFilter: string | null;
  onPersonFilterChange: (value: string | null) => void;
  statusFilter: string[];
  onStatusFilterChange: (values: string[]) => void;
}

const defaultHiddenStatuses = ["Dokončeno"];

export function useTableFilters() {
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { linkedPersonName, isAdmin, isOwner, loading: authLoading } = useAuth();
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [personInitialized, setPersonInitialized] = useState(false);

  // Initialize status filter once options are loaded
  useEffect(() => {
    if (statusOptions.length > 0 && !initialized) {
      const allLabels = getStatusFilterOptionValues(statusOptions.map((s) => s.label));
      setStatusFilter(allLabels.filter((s) => s === EMPTY_STATUS_FILTER_VALUE || !defaultHiddenStatuses.includes(s)));
      setInitialized(true);
    }
  }, [statusOptions, initialized]);

  // Auto-set person filter for non-admin roles with a linked person
  useEffect(() => {
    if (!authLoading && !personInitialized) {
      if (linkedPersonName && !isAdmin && !isOwner) {
        setPersonFilter(linkedPersonName);
      }
      setPersonInitialized(true);
    }
  }, [authLoading, linkedPersonName, isAdmin, isOwner, personInitialized]);

  const allLabels = getStatusFilterOptionValues(statusOptions.map((s) => s.label));
  const hasActiveFilters = personFilter !== null || (initialized && statusFilter.length !== allLabels.length);

  const clearFilters = () => {
    setPersonFilter(null);
    setStatusFilter([...allLabels]);
  };

  return {
    personFilter,
    setPersonFilter,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
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
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const statusValues = getStatusFilterOptionValues(statusOptions.map((s) => s.label));
  const filtered = statusValues.filter((statusValue) =>
    getStatusFilterLabel(statusValue).toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const toggle = (statusValue: string) => {
    if (value.includes(statusValue)) {
      onChange(value.filter((s) => s !== statusValue));
    } else {
      onChange([...value, statusValue]);
    }
  };

  const allSelected = value.length === statusValues.length;
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
          {filtered.map((statusValue) => (
            <div
              key={statusValue}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggle(statusValue)}
            >
              <Checkbox
                checked={value.includes(statusValue)}
                onCheckedChange={() => toggle(statusValue)}
                className="h-3.5 w-3.5"
              />
              <span>{getStatusFilterLabel(statusValue)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t mt-1 pt-1 px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs flex-1"
            onClick={() => onChange([...statusValues])}
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

interface FullTableFiltersProps extends TableFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  rightSlot?: React.ReactNode;
}

export function TableFilters({ personFilter, onPersonFilterChange, statusFilter, onStatusFilterChange, search, onSearchChange, rightSlot }: FullTableFiltersProps) {
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const allLabels = getStatusFilterOptionValues(statusOptions.map((s) => s.label));
  const hasActiveFilters = personFilter !== null || statusFilter.length !== allLabels.length;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <PersonFilterDropdown value={personFilter} onChange={onPersonFilterChange} />
        <StatusFilterDropdown value={statusFilter} onChange={onStatusFilterChange} />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onPersonFilterChange(null);
              onStatusFilterChange([...allLabels]);
            }}
          >
            <X className="h-3 w-3 mr-1" /> Zrušit filtry
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TableSearchBar value={search} onChange={onSearchChange} />
        {rightSlot}
      </div>
    </div>
  );
}
