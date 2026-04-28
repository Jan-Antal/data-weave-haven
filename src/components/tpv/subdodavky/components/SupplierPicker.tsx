/**
 * SupplierPicker — searchable supplier selector.
 *
 * Two modes:
 *   - single (default): pick one supplier (e.g. for "rýchle zadanie")
 *   - multi: pick N suppliers (e.g. for RFQ — send request to multiple)
 *
 * Uses shadcn Command + Popover pattern (already in app via cmdk).
 */

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

import { useSuppliers } from "../hooks";
import type { TpvSupplierRow } from "../../shared/types";

// ============================================================
// SINGLE-SELECT
// ============================================================

interface SupplierPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  category?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function SupplierPicker({
  value,
  onChange,
  category,
  placeholder = "Vybrať dodávateľa…",
  disabled,
}: SupplierPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: suppliers = [], isLoading } = useSuppliers({ category });

  const selected = useMemo(
    () => suppliers.find((s) => s.id === value),
    [suppliers, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate text-left">{selected.nazov}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Hľadať dodávateľa…" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Načítavam…" : "Žiadny dodávateľ nebol nájdený."}
            </CommandEmpty>
            <CommandGroup>
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.nazov} ${s.ico ?? ""}`}
                  onSelect={() => {
                    onChange(s.id === value ? null : s.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === s.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate">{s.nazov}</span>
                    {s.kategorie && s.kategorie.length > 0 && (
                      <span className="text-xs text-muted-foreground truncate">
                        {s.kategorie.join(" · ")}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// MULTI-SELECT — chip picker for RFQ
// ============================================================

interface SuppliersMultiPickerProps {
  values: string[];
  onChange: (ids: string[]) => void;
  category?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function SuppliersMultiPicker({
  values,
  onChange,
  category,
  placeholder = "Pridať dodávateľa…",
  disabled,
}: SuppliersMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: suppliers = [], isLoading } = useSuppliers({ category });

  const selected = useMemo(
    () => suppliers.filter((s) => values.includes(s.id)),
    [suppliers, values]
  );

  const toggle = (id: string) => {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id));
    } else {
      onChange([...values, id]);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              {placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Hľadať dodávateľa…" />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Načítavam…" : "Žiadny dodávateľ nebol nájdený."}
              </CommandEmpty>
              <CommandGroup>
                {suppliers.map((s) => {
                  const isSelected = values.includes(s.id);
                  return (
                    <CommandItem
                      key={s.id}
                      value={`${s.nazov} ${s.ico ?? ""}`}
                      onSelect={() => toggle(s.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate">{s.nazov}</span>
                        {s.kategorie && s.kategorie.length > 0 && (
                          <span className="text-xs text-muted-foreground truncate">
                            {s.kategorie.join(" · ")}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <SelectedSupplierChip
              key={s.id}
              supplier={s}
              onRemove={() => toggle(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedSupplierChip({
  supplier,
  onRemove,
}: {
  supplier: TpvSupplierRow;
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="secondary"
      className="pl-3 pr-1 py-1 gap-1.5 text-xs font-medium"
    >
      <span className="truncate max-w-[180px]">{supplier.nazov}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-background/50"
        aria-label={`Odstrániť ${supplier.nazov}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
