import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useAllPeople } from "@/hooks/usePeople";
import { statusOrder } from "@/data/projects";

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

export function TableFilters({ personFilter, onPersonFilterChange, statusFilter, onStatusFilterChange }: TableFiltersProps) {
  const { data: people = [] } = useAllPeople();
  const uniqueNames = [...new Set(people.map((p) => p.name))].sort();

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
      {/* Person filter */}
      <Select
        value={personFilter ?? "__all__"}
        onValueChange={(v) => onPersonFilterChange(v === "__all__" ? null : v)}
      >
        <SelectTrigger className="h-8 text-sm w-[180px]">
          <SelectValue placeholder="Osoba" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Všechny osoby</SelectItem>
          {uniqueNames.map((name) => (
            <SelectItem key={name} value={name}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

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
