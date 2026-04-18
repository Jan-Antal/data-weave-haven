import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CapacitySettings } from "@/components/production/CapacitySettings";
import { useEmployeesForWeek, type EmployeeWeekRow } from "@/hooks/useOsoby";
import { toggleEmployeeForWeekRange, getWeekStartFromNumber } from "@/hooks/useCapacityCalc";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

function getCurrentISOWeek(): { year: number; week: number } {
  const d = new Date();
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

interface Props {
  /** Render the dialog wrapper too? When inside SpravaOsob we render inline only. */
  inline?: boolean;
}

export function OsobyKapacita({ inline = true }: Props) {
  const qc = useQueryClient();
  const today = getCurrentISOWeek();
  const [selectedYear, setSelectedYear] = useState(today.year);
  const [selectedWeek, setSelectedWeek] = useState(today.week);

  const weekStart = useMemo(() => getWeekStartFromNumber(selectedYear, selectedWeek), [selectedYear, selectedWeek]);
  const { data: empList = [] } = useEmployeesForWeek(weekStart, selectedYear, selectedWeek);

  // Listen to week changes from CapacitySettings via custom event
  // (simple cross-component bridge without modifying CapacitySettings internals)
  // Falls back to current week if no event has been received.
  useMemo(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ year: number; week: number }>;
      if (ce.detail) {
        setSelectedYear(ce.detail.year);
        setSelectedWeek(ce.detail.week);
      }
    };
    window.addEventListener("capacity-week-selected", handler as EventListener);
    return () => window.removeEventListener("capacity-week-selected", handler as EventListener);
  }, []);

  const handleToggle = async (emp: EmployeeWeekRow, included: boolean) => {
    await toggleEmployeeForWeekRange(selectedYear, selectedWeek, selectedWeek, [emp.id], included);
    qc.invalidateQueries({ queryKey: ["employees-for-week"] });
    qc.invalidateQueries({ queryKey: ["week-composition"] });
    qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
  };

  // Group by stredisko
  const grouped = useMemo(() => {
    const g = new Map<string, EmployeeWeekRow[]>();
    for (const e of empList) {
      const key = e.stredisko ?? "Nepriradené";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(e);
    }
    return g;
  }, [empList]);

  return (
    <Tabs defaultValue="kapacita" className="h-full flex flex-col overflow-hidden">
      <TabsList className="mx-4 mt-2 self-start">
        <TabsTrigger value="kapacita">Kapacita</TabsTrigger>
        <TabsTrigger value="zamestnanci">Zaměstnanci</TabsTrigger>
      </TabsList>

      <TabsContent value="kapacita" className="flex-1 overflow-hidden mt-2">
        {/* Embed the existing capacity settings as inline (open=true). */}
        <CapacitySettings open={true} onOpenChange={() => { /* controlled by parent */ }} />
      </TabsContent>

      <TabsContent value="zamestnanci" className="flex-1 overflow-y-auto mt-2 px-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Vybraný týden:</span>
          <Badge variant="secondary">
            T{selectedWeek}/{selectedYear} ({format(new Date(weekStart + "T00:00:00"), "d. M.", { locale: cs })})
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            Aktivních: {empList.filter(e => e.is_included_in_week).length} / {empList.length}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Jméno</TableHead>
              <TableHead className="w-[160px]">Úsek</TableHead>
              <TableHead className="w-[140px]">Pozice</TableHead>
              <TableHead className="w-[100px]">Úvazek</TableHead>
              <TableHead className="w-[120px] text-right">V kapacitě</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(grouped.entries()).map(([stredisko, list]) => (
              <>
                <TableRow key={`${stredisko}-hdr`} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={5} className="font-semibold text-sm py-1.5">
                    {stredisko} <span className="text-xs text-muted-foreground font-normal">({list.length})</span>
                  </TableCell>
                </TableRow>
                {list.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.meno}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.usek_nazov ?? e.usek}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.pozicia ?? "—"}</TableCell>
                    <TableCell className="text-sm">{(e.uvazok_hodiny ?? 8) * 5} h/týd</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={e.is_included_in_week}
                        onCheckedChange={(v) => handleToggle(e, v)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ))}
            {empList.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Žádní aktivní zaměstnanci v tomto týdnu.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  );
}
