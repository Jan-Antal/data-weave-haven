import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { usePeople } from "@/hooks/usePeople";
import { usePeopleManagement } from "./PeopleManagementContext";
import { Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeopleSelectProps {
  role: "PM" | "Konstruktér" | "Kalkulant";
  value: string;
  onValueChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PeopleSelect({ role, value, onValueChange, open, onOpenChange }: PeopleSelectProps) {
  const { data: people = [] } = usePeople(role);
  const [search, setSearch] = useState("");
  const { openPeopleManagement } = usePeopleManagement();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (open) setSearch("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div className={cn(
          "h-7 flex items-center justify-between text-xs px-2 border rounded cursor-pointer bg-background",
          "hover:bg-muted/50"
        )}>
          <span className="truncate">{value || "—"}</span>
          <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0 text-muted-foreground" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat..."
          className="h-7 text-xs mb-1"
        />
        <div className="max-h-[200px] overflow-y-auto">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={cn(
                "px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground",
                p.name === value && "bg-accent text-accent-foreground"
              )}
              onClick={() => {
                onValueChange(p.name);
              }}
            >
              {p.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenalezeno</div>
          )}
        </div>
        <div
          className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent hover:text-accent-foreground font-medium flex items-center gap-1 border-t mt-1 pt-1"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openPeopleManagement();
            onOpenChange?.(false);
          }}
        >
          <Plus className="h-3 w-3" /> Přidat osobu
        </div>
      </PopoverContent>
    </Popover>
  );
}
