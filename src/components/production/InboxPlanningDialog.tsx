import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { format, addDays } from "date-fns";
import { cs } from "date-fns/locale";
import { AlertTriangle, Split, Calendar } from "lucide-react";

export interface PlanningItem {
  id: string;
  item_name: string;
  item_code: string | null;
  estimated_hours: number;
  estimated_czk: number;
  stage_id: string | null;
}

export interface PlanningWeek {
  key: string;        // "2026-03-16"
  weekNum: number;
  label: string;      // "T11 · 9.3 – 15.3"
  remainingCapacity: number;
}

export interface SchedulePlanEntry {
  inboxItemId: string;
  scheduledWeek: string;
  scheduledHours: number;
  scheduledCzk: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  items: PlanningItem[];
  weeks: PlanningWeek[];
  weeklyCapacity: number;
  onConfirm: (plan: SchedulePlanEntry[]) => void;
}

function formatCzkShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
  return `${Math.round(v)} Kč`;
}

// ── TAB 1: By Weeks ──────────────────────────────────────────────

interface WeekRow {
  key: string;
  weekNum: number;
  label: string;
  remainingCapacity: number;
  checked: boolean;
  hours: number;
}

function ByWeeksTab({ items, weeks, onConfirm, onCancel }: { items: PlanningItem[]; weeks: PlanningWeek[]; onConfirm: (plan: SchedulePlanEntry[]) => void; onCancel: () => void }) {
  const totalHours = items.reduce((s, i) => s + i.estimated_hours, 0);
  const totalCzk = items.reduce((s, i) => s + i.estimated_czk, 0);
  const czkPerHour = totalHours > 0 ? totalCzk / totalHours : 0;

  const [weekRows, setWeekRows] = useState<WeekRow[]>(() =>
    weeks.map(w => ({ ...w, checked: false, hours: 0 }))
  );
  const [autoFillLast, setAutoFillLast] = useState(false);

  const assignedHours = weekRows.reduce((s, w) => s + (w.checked ? w.hours : 0), 0);
  const remainingToAssign = totalHours - assignedHours;
  const progress = totalHours > 0 ? Math.min(100, (assignedHours / totalHours) * 100) : 0;

  const toggleWeek = useCallback((key: string) => {
    setWeekRows(prev => {
      const rows = [...prev];
      const idx = rows.findIndex(r => r.key === key);
      if (idx < 0) return prev;
      const row = { ...rows[idx] };
      row.checked = !row.checked;
      if (row.checked) {
        // Auto-fill: min(remaining capacity, remaining unassigned hours)
        const alreadyAssigned = rows.reduce((s, r, i) => s + (i !== idx && r.checked ? r.hours : 0), 0);
        const remaining = totalHours - alreadyAssigned;
        row.hours = Math.max(0, Math.min(row.remainingCapacity, remaining));
      } else {
        row.hours = 0;
      }
      rows[idx] = row;
      return rows;
    });
  }, [totalHours]);

  const setWeekHours = useCallback((key: string, hours: number) => {
    setWeekRows(prev => prev.map(r => r.key === key ? { ...r, hours: Math.max(0, hours) } : r));
  }, []);

  // Apply auto-fill-last logic
  const effectiveWeekRows = useMemo(() => {
    if (!autoFillLast) return weekRows;
    const rows = [...weekRows];
    const checkedIndices = rows.map((r, i) => r.checked ? i : -1).filter(i => i >= 0);
    if (checkedIndices.length === 0) return rows;
    const lastIdx = checkedIndices[checkedIndices.length - 1];
    const sumOthers = rows.reduce((s, r, i) => s + (r.checked && i !== lastIdx ? r.hours : 0), 0);
    rows[lastIdx] = { ...rows[lastIdx], hours: Math.max(0, totalHours - sumOthers) };
    return rows;
  }, [weekRows, autoFillLast, totalHours]);

  const effectiveAssigned = effectiveWeekRows.reduce((s, w) => s + (w.checked ? w.hours : 0), 0);
  const isExact = Math.abs(effectiveAssigned - totalHours) < 0.01;
  const isOver = effectiveAssigned > totalHours;

  const handleConfirm = () => {
    // Distribute items across selected weeks proportionally
    const selectedWeeks = effectiveWeekRows.filter(w => w.checked && w.hours > 0);
    if (selectedWeeks.length === 0) return;

    const plan: SchedulePlanEntry[] = [];
    const sortedItems = [...items].sort((a, b) => b.estimated_hours - a.estimated_hours);
    let weekIdx = 0;
    let weekHoursLeft = selectedWeeks[0].hours;

    for (const item of sortedItems) {
      let itemHoursLeft = item.estimated_hours;

      while (itemHoursLeft > 0 && weekIdx < selectedWeeks.length) {
        if (weekHoursLeft <= 0) {
          weekIdx++;
          if (weekIdx >= selectedWeeks.length) break;
          weekHoursLeft = selectedWeeks[weekIdx].hours;
          continue;
        }

        const assign = Math.min(itemHoursLeft, weekHoursLeft);
        plan.push({
          inboxItemId: item.id,
          scheduledWeek: selectedWeeks[weekIdx].key,
          scheduledHours: assign,
          scheduledCzk: Math.round(assign * czkPerHour),
        });
        itemHoursLeft -= assign;
        weekHoursLeft -= assign;
      }

      // If weeks exhausted but item has hours left, put remainder in last week
      if (itemHoursLeft > 0 && selectedWeeks.length > 0) {
        plan.push({
          inboxItemId: item.id,
          scheduledWeek: selectedWeeks[selectedWeeks.length - 1].key,
          scheduledHours: itemHoursLeft,
          scheduledCzk: Math.round(itemHoursLeft * czkPerHour),
        });
      }
    }

    onConfirm(plan);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-foreground">
          Celkem: {Math.round(totalHours)}h · {formatCzkShort(totalCzk)}
        </span>
        <span className="text-xs text-muted-foreground">
          {items.length} položek
        </span>
      </div>

      {/* Week list */}
      <div className="max-h-[340px] overflow-y-auto space-y-1 pr-1">
        {effectiveWeekRows.map(w => {
          const overCapacity = w.checked && w.hours > w.remainingCapacity;
          return (
            <div
              key={w.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 border transition-colors"
              style={{
                borderColor: overCapacity ? "#DC2626" : w.checked ? "hsl(var(--primary) / 0.3)" : "hsl(var(--border))",
                backgroundColor: w.checked ? "hsl(var(--primary) / 0.04)" : "transparent",
              }}
            >
              <Checkbox
                checked={w.checked}
                onCheckedChange={() => toggleWeek(w.key)}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{w.label}</div>
                <div className="text-[10px]" style={{
                  color: w.remainingCapacity > 200 ? "#16A34A" : w.remainingCapacity > 0 ? "#D97706" : "#DC2626"
                }}>
                  Volná kapacita: {Math.round(w.remainingCapacity)}h
                </div>
              </div>
              {w.checked && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={w.hours || ""}
                    onChange={e => setWeekHours(w.key, parseFloat(e.target.value) || 0)}
                    className="w-[70px] h-7 text-xs font-mono text-right"
                    min={0}
                  />
                  <span className="text-[10px] text-muted-foreground">h</span>
                  {overCapacity && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#DC2626" }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress */}
      <div className="space-y-1.5 px-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Přiřazeno: <span className="font-mono font-medium text-foreground">{Math.round(effectiveAssigned)}h</span> / {Math.round(totalHours)}h
          </span>
          {isOver && (
            <span className="text-xs font-medium" style={{ color: "#D97706" }}>
              Překračuje o {Math.round(effectiveAssigned - totalHours)}h
            </span>
          )}
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center gap-2">
          <Checkbox
            id="auto-fill-last"
            checked={autoFillLast}
            onCheckedChange={(v) => setAutoFillLast(!!v)}
          />
          <label htmlFor="auto-fill-last" className="text-[11px] text-muted-foreground cursor-pointer">
            Přiřadit zbytek poslednímu týdnu
          </label>
        </div>
      </div>

      {/* Confirm */}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Zrušit
        </Button>
        <Button
          size="sm"
          disabled={!isExact && !autoFillLast}
          onClick={handleConfirm}
        >
          <Calendar className="h-3.5 w-3.5 mr-1.5" />
          Naplánovat
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── TAB 2: By Items ──────────────────────────────────────────────

interface ItemAssignment {
  id: string;
  item_name: string;
  item_code: string | null;
  estimated_hours: number;
  estimated_czk: number;
  stage_id: string | null;
  weekKey: string;
  // Split state
  isSplit: boolean;
  splitParts?: { hours: number; czk: number; weekKey: string }[];
}

function ByItemsTab({ items, weeks, onConfirm }: { items: PlanningItem[]; weeks: PlanningWeek[]; onConfirm: (plan: SchedulePlanEntry[]) => void }) {
  const [assignments, setAssignments] = useState<ItemAssignment[]>(() =>
    items.map(item => {
      // Default: first week with enough capacity
      const defaultWeek = weeks.find(w => w.remainingCapacity >= item.estimated_hours) || weeks[0];
      return {
        ...item,
        weekKey: defaultWeek?.key || "",
        isSplit: false,
      };
    })
  );

  // Track used capacity per week (live)
  const weekUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const a of assignments) {
      if (a.isSplit && a.splitParts) {
        for (const part of a.splitParts) {
          usage.set(part.weekKey, (usage.get(part.weekKey) || 0) + part.hours);
        }
      } else {
        usage.set(a.weekKey, (usage.get(a.weekKey) || 0) + a.estimated_hours);
      }
    }
    return usage;
  }, [assignments]);

  const setItemWeek = (id: string, weekKey: string) => {
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, weekKey } : a));
  };

  const toggleSplit = (id: string) => {
    setAssignments(prev => prev.map(a => {
      if (a.id !== id) return a;
      if (a.isSplit) {
        // Unsplit
        return { ...a, isSplit: false, splitParts: undefined };
      }
      // Split into 2 equal parts
      const h1 = Math.ceil(a.estimated_hours / 2);
      const h2 = a.estimated_hours - h1;
      const czkPerH = a.estimated_hours > 0 ? a.estimated_czk / a.estimated_hours : 0;
      const w2 = weeks.length > 1 ? weeks[1]?.key : weeks[0]?.key || "";
      return {
        ...a,
        isSplit: true,
        splitParts: [
          { hours: h1, czk: Math.round(h1 * czkPerH), weekKey: a.weekKey },
          { hours: h2, czk: Math.round(h2 * czkPerH), weekKey: w2 },
        ],
      };
    }));
  };

  const setSplitPartHours = (id: string, partIdx: number, hours: number) => {
    setAssignments(prev => prev.map(a => {
      if (a.id !== id || !a.splitParts) return a;
      const czkPerH = a.estimated_hours > 0 ? a.estimated_czk / a.estimated_hours : 0;
      const parts = [...a.splitParts];
      parts[partIdx] = { ...parts[partIdx], hours: Math.max(0, hours), czk: Math.round(Math.max(0, hours) * czkPerH) };
      // Auto-adjust other part
      const otherIdx = partIdx === 0 ? 1 : 0;
      const otherHours = Math.max(0, a.estimated_hours - Math.max(0, hours));
      parts[otherIdx] = { ...parts[otherIdx], hours: otherHours, czk: Math.round(otherHours * czkPerH) };
      return { ...a, splitParts: parts };
    }));
  };

  const setSplitPartWeek = (id: string, partIdx: number, weekKey: string) => {
    setAssignments(prev => prev.map(a => {
      if (a.id !== id || !a.splitParts) return a;
      const parts = [...a.splitParts];
      parts[partIdx] = { ...parts[partIdx], weekKey };
      return { ...a, splitParts: parts };
    }));
  };

  // Validation
  const allAssigned = assignments.every(a => {
    if (a.isSplit && a.splitParts) {
      const sum = a.splitParts.reduce((s, p) => s + p.hours, 0);
      return Math.abs(sum - a.estimated_hours) < 0.5 && a.splitParts.every(p => p.weekKey && p.hours > 0);
    }
    return !!a.weekKey;
  });

  const handleConfirm = () => {
    const plan: SchedulePlanEntry[] = [];
    for (const a of assignments) {
      if (a.isSplit && a.splitParts) {
        for (const part of a.splitParts) {
          plan.push({
            inboxItemId: a.id,
            scheduledWeek: part.weekKey,
            scheduledHours: part.hours,
            scheduledCzk: part.czk,
          });
        }
      } else {
        plan.push({
          inboxItemId: a.id,
          scheduledWeek: a.weekKey,
          scheduledHours: a.estimated_hours,
          scheduledCzk: a.estimated_czk,
        });
      }
    }
    onConfirm(plan);
  };

  // Weeks used for footer capacity bars
  const usedWeekKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of assignments) {
      if (a.isSplit && a.splitParts) {
        a.splitParts.forEach(p => keys.add(p.weekKey));
      } else {
        keys.add(a.weekKey);
      }
    }
    return Array.from(keys).filter(Boolean);
  }, [assignments]);

  return (
    <div className="space-y-3">
      {/* Item rows */}
      <div className="max-h-[320px] overflow-y-auto space-y-1 pr-1">
        {assignments.map(a => {
          const exceedsCapacity = !a.isSplit && (() => {
            const w = weeks.find(ww => ww.key === a.weekKey);
            if (!w) return false;
            return (weekUsage.get(a.weekKey) || 0) > w.remainingCapacity;
          })();

          return (
            <div key={a.id} className="rounded-md border border-border p-2 space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {a.item_code && <span className="font-mono text-[10px] font-medium text-foreground">{a.item_code}</span>}
                    <span className="text-xs truncate text-muted-foreground">{a.item_name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{Math.round(a.estimated_hours)}h</span>
                </div>

                {!a.isSplit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Select value={a.weekKey} onValueChange={v => setItemWeek(a.id, v)}>
                      <SelectTrigger className="h-7 w-[150px] text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {weeks.map(w => (
                          <SelectItem key={w.key} value={w.key} className="text-[10px]">
                            {w.label} ({Math.round(w.remainingCapacity)}h)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {exceedsCapacity && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#D97706" }} />}
                  </div>
                )}

                <button
                  onClick={() => toggleSplit(a.id)}
                  className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                  title={a.isSplit ? "Sloučit" : "Rozdělit"}
                >
                  <Split className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Split parts */}
              {a.isSplit && a.splitParts && (
                <div className="ml-4 space-y-1 border-l-2 border-border pl-2">
                  {a.splitParts.map((part, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <span className="text-[9px] font-medium text-muted-foreground shrink-0">
                        Část {pi + 1}:
                      </span>
                      <Input
                        type="number"
                        value={part.hours || ""}
                        onChange={e => setSplitPartHours(a.id, pi, parseFloat(e.target.value) || 0)}
                        className="w-[60px] h-6 text-[10px] font-mono text-right"
                        min={0}
                        max={a.estimated_hours}
                      />
                      <span className="text-[9px] text-muted-foreground">h →</span>
                      <Select value={part.weekKey} onValueChange={v => setSplitPartWeek(a.id, pi, v)}>
                        <SelectTrigger className="h-6 w-[140px] text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {weeks.map(w => (
                            <SelectItem key={w.key} value={w.key} className="text-[10px]">
                              {w.label} ({Math.round(w.remainingCapacity)}h)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {(() => {
                    const sum = a.splitParts.reduce((s, p) => s + p.hours, 0);
                    const diff = Math.abs(sum - a.estimated_hours);
                    if (diff > 0.5) return (
                      <div className="text-[9px] font-medium" style={{ color: "#DC2626" }}>
                        Součet: {Math.round(sum)}h ≠ {Math.round(a.estimated_hours)}h
                      </div>
                    );
                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: mini capacity bars */}
      {usedWeekKeys.length > 0 && (
        <div className="border-t border-border pt-2 space-y-1 px-1">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">Využití kapacity:</div>
          {usedWeekKeys.map(key => {
            const w = weeks.find(ww => ww.key === key);
            if (!w) return null;
            const used = weekUsage.get(key) || 0;
            const total = w.remainingCapacity;
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 100;
            const over = used > total;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[9px] font-mono w-[80px] shrink-0 text-muted-foreground">{w.label.split("·")[0]?.trim()}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "hsl(var(--muted))" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: over ? "#DC2626" : pct > 80 ? "#D97706" : "#16A34A",
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono shrink-0" style={{ color: over ? "#DC2626" : "hsl(var(--muted-foreground))" }}>
                  {Math.round(used)}/{Math.round(total)}h
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm */}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => {}}>
          Zrušit
        </Button>
        <Button size="sm" disabled={!allAssigned} onClick={handleConfirm}>
          <Calendar className="h-3.5 w-3.5 mr-1.5" />
          Naplánovat
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Main Dialog ──────────────────────────────────────────────────

export function InboxPlanningDialog({ open, onOpenChange, projectId, projectName, items, weeks, weeklyCapacity, onConfirm }: Props) {
  const [tab, setTab] = useState<string>("by-weeks");

  const handleConfirm = useCallback((plan: SchedulePlanEntry[]) => {
    onConfirm(plan);
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Naplánovat: {projectName}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="by-weeks" className="text-xs">Podle týdnů</TabsTrigger>
            <TabsTrigger value="by-items" className="text-xs">Podle položek</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="by-weeks" className="mt-0">
              <ByWeeksTab items={items} weeks={weeks} onConfirm={handleConfirm} />
            </TabsContent>
            <TabsContent value="by-items" className="mt-0">
              <ByItemsTab items={items} weeks={weeks} onConfirm={handleConfirm} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
