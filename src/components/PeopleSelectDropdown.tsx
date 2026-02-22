import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePeople } from "@/hooks/usePeople";
import { usePeopleManagement } from "./PeopleManagementContext";
import { Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeopleSelectDropdownProps {
  role: "PM" | "Konstruktér" | "Kalkulant";
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function PeopleSelectDropdown({ role, value, onValueChange, placeholder }: PeopleSelectDropdownProps) {
  const { data: people = [] } = usePeople(role);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { openPeopleManagement } = usePeopleManagement();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
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
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal h-10", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || placeholder || "Vyberte..."}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1 z-[99999]" align="start">
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hledat..."
          className="h-8 text-sm mb-1"
        />
        <div className="max-h-[200px] overflow-y-auto">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={cn(
                "px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent hover:text-accent-foreground",
                p.name === value && "bg-accent text-accent-foreground"
              )}
              onClick={() => {
                onValueChange(p.name);
                setOpen(false);
              }}
            >
              {p.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenalezeno</div>
          )}
        </div>
        <div
          className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent hover:text-accent-foreground font-medium flex items-center gap-1 border-t mt-1 pt-1"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openPeopleManagement();
            setOpen(false);
          }}
        >
          <Plus className="h-3 w-3" /> Přidat osobu
        </div>
      </PopoverContent>
    </Popover>
  );
}
