import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { OverbookedWeek } from "@/hooks/useForecastMode";

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000);
  return Math.ceil((dayOfYear + yearStart.getUTCDay() + 1) / 7);
}

function formatWeekRange(dateStr: string): string {
  const monday = new Date(dateStr + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.getDate()}.${monday.getMonth() + 1}–${sunday.getDate()}.${sunday.getMonth() + 1}`;
}

interface OverbookWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overbookedWeeks: OverbookedWeek[];
}

export function OverbookWarningDialog({ open, onOpenChange, overbookedWeeks }: OverbookWarningDialogProps) {
  const sorted = [...overbookedWeeks].sort((a, b) => b.utilizationPct - a.utilizationPct);

  const handleExport = () => {
    const lines = [
      "Přetížení kapacity výroby",
      "═══════════════════════════",
      "",
      "Týden\t\tVyužití\tHodiny\t\tProjekty",
      "─────\t\t───────\t──────\t\t────────",
    ];
    for (const w of sorted) {
      const wn = getWeekNumber(w.week);
      const range = formatWeekRange(w.week);
      lines.push(`T${wn} ${range}\t${w.utilizationPct}%\t${w.hoursScheduled}h / ${w.capacity}h\t${w.projectsInWeek.join(", ")}`);
    }
    lines.push("");
    lines.push("Doporučujeme projednat posunutí termínů u projektů v přetížených týdnech.");
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "📋 Zkopírováno do schránky" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px] p-0 overflow-hidden" style={{ backgroundColor: "#1a1a10", border: "1px solid #4a3d00" }}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base" style={{ color: "#fbbf24" }}>
            <AlertTriangle className="h-5 w-5" style={{ color: "#f59e0b" }} />
            Přetížení kapacity výroby
          </DialogTitle>
          <p className="text-sm mt-1" style={{ color: "#a8956a" }}>
            {sorted.length} {sorted.length === 1 ? "týden překračuje" : sorted.length < 5 ? "týdny překračují" : "týdnů překračuje"} 125% kapacity
          </p>
        </DialogHeader>

        <div className="px-5 pb-3 overflow-auto max-h-[400px]">
          <table className="w-full text-sm" style={{ color: "#d4c68a" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #3d3400" }}>
                <th className="text-left py-2 px-2 font-semibold text-xs" style={{ color: "#a8956a" }}>Týden</th>
                <th className="text-right py-2 px-2 font-semibold text-xs" style={{ color: "#a8956a" }}>Využití</th>
                <th className="text-right py-2 px-2 font-semibold text-xs" style={{ color: "#a8956a" }}>Hodiny</th>
                <th className="text-left py-2 px-2 font-semibold text-xs" style={{ color: "#a8956a" }}>Projekty</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const wn = getWeekNumber(w.week);
                const range = formatWeekRange(w.week);
                const color = w.utilizationPct > 150 ? "#ef4444" : "#f59e0b";
                return (
                  <tr key={w.week} style={{ borderBottom: "1px solid #2d2800" }}>
                    <td className="py-2 px-2 font-mono text-xs">
                      <span className="font-bold" style={{ color }}>T{wn}</span>
                      <span className="ml-1.5 opacity-70">{range}</span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold font-mono text-xs" style={{ color }}>
                      {w.utilizationPct}%
                      <span className="ml-1 font-normal opacity-70">({w.hoursScheduled}h / {w.capacity}h)</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      {w.hoursScheduled}h / {w.capacity}h
                    </td>
                    <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={w.projectsInWeek.join(", ")}>
                      {w.projectsInWeek.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3" style={{ borderTop: "1px solid #3d3400", backgroundColor: "#151208" }}>
          <p className="text-xs mb-3" style={{ color: "#8a7a4a" }}>
            Doporučujeme projednat posunutí termínů u projektů v přetížených týdnech.
          </p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="text-xs"
              style={{ backgroundColor: "transparent", borderColor: "#4a3d00", color: "#d4c68a" }}
            >
              <Copy className="h-3 w-3 mr-1" />
              Exportovat přehled
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
              style={{ backgroundColor: "#4a3d00", color: "#fbbf24" }}
            >
              <X className="h-3 w-3 mr-1" />
              Zavřít
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Persistent badge for toolbar — clickable to reopen dialog */
export function OverbookBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors hover:opacity-90"
      style={{ backgroundColor: "#451a03", color: "#fbbf24", border: "1px solid #78350f" }}
    >
      <AlertTriangle className="h-3 w-3" />
      ⚠ {count} přetížených týdnů
    </button>
  );
}
