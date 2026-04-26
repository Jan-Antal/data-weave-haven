import { useState, useMemo, useCallback } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { normalizeSearch, normalizedIncludes } from "@/lib/statusFilter";

// ── Helpers ─────────────────────────────────────────────────────────
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

export function formatHours(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("cs-CZ") + " h";
}

// ── MultiSelectFilter (Toggl-style) ─────────────────────────────────
export interface FilterOption {
  value: string;
  label: string;
  hint?: string;
  hodiny?: number;
  searchTokens: string[];
}

export function MultiSelectFilter({
  label, options, value, onChange,
}: {
  label: string;
  options: FilterOption[];
  value: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const selectedCount = value === null ? options.length : value.size;
  const isAll = value === null;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalizeSearch(query);
    return options.filter((o) => o.searchTokens.some((t) => normalizedIncludes(t, q)));
  }, [options, query]);

  const isChecked = useCallback(
    (val: string) => (value === null ? true : value.has(val)),
    [value],
  );

  const toggle = useCallback(
    (val: string) => {
      const current = value === null ? new Set(allValues) : new Set(value);
      if (current.has(val)) current.delete(val);
      else current.add(val);
      if (current.size === allValues.length) onChange(null);
      else onChange(current);
    },
    [value, allValues, onChange],
  );

  const selectAll = useCallback(() => onChange(null), [onChange]);
  const clearAll = useCallback(() => onChange(new Set()), [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-3 text-xs gap-1.5",
            !isAll && "border-primary/50 text-foreground",
          )}
        >
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">
            {isAll ? "Vše" : `(${selectedCount})`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 z-[99999]" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Hledat..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={selectAll}>
            Vybrat vše
          </Button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {selectedCount} / {options.length}
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearAll}>
            Zrušit vše
          </Button>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Žádné výsledky
            </div>
          ) : (
            filtered.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 cursor-pointer text-xs"
              >
                <Checkbox
                  checked={isChecked(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                {o.hint && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {o.hint}
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── CollapsibleSection (colored block) ──────────────────────────────
export type SectionTone = "projekty" | "rezie" | "nesparovane" | "neutral";

export function sectionStyle(tone: SectionTone): { card: string; header: string; badge: string; icon?: boolean } {
  switch (tone) {
    case "projekty":
      return { card: "border-green-200", header: "bg-green-50/80", badge: "bg-green-100 text-green-800 border-green-300" };
    case "rezie":
      return { card: "border-purple-200", header: "bg-purple-50/80", badge: "bg-purple-100 text-purple-800 border-purple-300" };
    case "nesparovane":
      return { card: "border-amber-300", header: "bg-amber-50/80", badge: "bg-amber-100 text-amber-800 border-amber-300", icon: true };
    default:
      return { card: "border-border", header: "bg-muted/40", badge: "bg-background text-foreground border-border" };
  }
}

export function CollapsibleSection({
  tone, title, count, hours, collapsed, onToggle, countLabel, children,
}: {
  tone: SectionTone;
  title: string;
  count: number;
  hours: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Custom label for the count (e.g. "zaměstnanců"). Defaults to projects pluralization. */
  countLabel?: (n: number) => string;
  children: React.ReactNode;
}) {
  const s = sectionStyle(tone);
  const label = countLabel
    ? countLabel(count)
    : `${count === 1 ? "projekt" : count < 5 ? "projekty" : "projektů"}`;
  return (
    <section className={cn("rounded-lg border shadow-sm overflow-hidden bg-card", s.card)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2 border-b text-left transition-colors hover:brightness-95",
          s.header,
        )}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          {s.icon && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
          <Badge variant="outline" className={cn("text-[11px] font-semibold border px-2.5 py-0.5 shrink-0", s.badge)}>
            {title}
          </Badge>
          <span className="text-[12px] font-medium text-foreground/80">
            {count} {label}
          </span>
          <span className="text-[11px] text-muted-foreground">· {formatHours(hours)}</span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", collapsed && "-rotate-90")}
        />
      </button>
      {!collapsed && <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}
