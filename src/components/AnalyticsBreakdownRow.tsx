import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type TimeRange = "week" | "month" | "3months" | "year" | "all";

function getRangeStart(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  const d = new Date(now);
  if (range === "week") d.setDate(d.getDate() - 7);
  else if (range === "month") d.setDate(d.getDate() - 30);
  else if (range === "3months") d.setDate(d.getDate() - 90);
  else if (range === "year") d.setDate(d.getDate() - 365);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHours(n: number): string {
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " h";
}

interface Props {
  projectId: string;
  colSpan: number;
  timeRange: TimeRange;
}

export function AnalyticsBreakdownRow({ projectId, colSpan, timeRange }: Props) {
  const rangeStart = getRangeStart(timeRange);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-breakdown", projectId, timeRange],
    queryFn: async () => {
      let q = supabase
        .from("production_hours_log")
        .select("zamestnanec, hodiny, datum_sync, cinnost_kod")
        .eq("ami_project_id", projectId);
      if (rangeStart) q = q.gte("datum_sync", rangeStart);
      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, { hours: number; min: string; max: string }>();
      for (const r of (data || []) as Array<{ zamestnanec: string; hodiny: number | string; datum_sync: string; cinnost_kod: string | null }>) {
        if (r.cinnost_kod && ["TPV", "ENG", "PRO"].includes(r.cinnost_kod)) continue;
        const h = Number(r.hodiny) || 0;
        if (h <= 0) continue;
        const e = map.get(r.zamestnanec);
        if (!e) {
          map.set(r.zamestnanec, { hours: h, min: r.datum_sync, max: r.datum_sync });
        } else {
          e.hours += h;
          if (r.datum_sync < e.min) e.min = r.datum_sync;
          if (r.datum_sync > e.max) e.max = r.datum_sync;
        }
      }
      return Array.from(map.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.hours - a.hours);
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="px-6 py-3 max-h-64 overflow-auto">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !data || data.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Žádné záznamy hodin v tomto období.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-medium py-1 pr-3">Zaměstnanec</th>
                  <th className="text-right font-medium py-1 px-3 tabular-nums">Hodiny</th>
                  <th className="text-left font-medium py-1 pl-3">Období</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.name} className="border-b border-border/40 last:border-0">
                    <td className="py-1 pr-3">{row.name}</td>
                    <td className="py-1 px-3 text-right tabular-nums font-medium">
                      {formatHours(row.hours)}
                    </td>
                    <td className="py-1 pl-3 text-muted-foreground tabular-nums">
                      {row.min === row.max ? row.min : `${row.min} – ${row.max}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
