import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTpvPipelineProjects } from "@/hooks/useTpvPipelineProjects";
import { useUpsertTpvPreparation } from "@/hooks/useTpvPreparation";
import { HoursWorkflowBar } from "@/components/tpv/HoursWorkflowBar";

const DEFAULT_PRODUCTION_PCT = 25;

function formatCzk(n: number): string {
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " Kč";
}

export function TpvHoursTab() {
  const { rows } = useTpvPipelineProjects();
  const [projectId, setProjectId] = useState<string>("");
  const upsert = useUpsertTpvPreparation();

  const projectRow = rows.find((r) => r.project.project_id === projectId) ?? rows[0];

  // Auto-select first project
  if (!projectId && rows[0]) {
    setProjectId(rows[0].project.project_id);
  }

  const HOURLY_RATE = 550; // matches production_settings default

  const stats = useMemo(() => {
    if (!projectRow) return { budget: 0, auto: 0, manual: 0, zostatok: 0 };
    const proj: any = projectRow.project;
    const cena = Number(proj.prodejni_cena ?? 0);
    const productionPct = Number(proj.cost_production_pct ?? DEFAULT_PRODUCTION_PCT);
    const budgetCzk = cena * (productionPct / 100);
    const budgetHours = budgetCzk / HOURLY_RATE;
    const auto = projectRow.totalAutoHours;
    const manual = projectRow.totalEffectiveHours;
    const zostatok = budgetHours - manual;
    return { budget: budgetHours, budgetCzk, auto, manual, zostatok };
  }, [projectRow]);

  const hasManualEdits = projectRow?.items.some((it) => {
    const prep = projectRow.prepByItemId.get(it.id);
    return prep?.hodiny_manual != null;
  }) ?? false;
  const lowBudget = stats.budget > 0 && hasManualEdits && stats.zostatok / stats.budget < 0.1;

  return (
    <div className="p-4 space-y-4 overflow-auto h-full bg-background">
      <div className="flex items-center gap-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Projekt</div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[400px]"><SelectValue placeholder="Projekt" /></SelectTrigger>
          <SelectContent>
            {rows.map((r) => (
              <SelectItem key={r.project.project_id} value={r.project.project_id}>
                {r.project.project_id} — {r.project.project_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Budget" value={`${Math.round(stats.budget)} h`} sub={stats.budgetCzk ? formatCzk(stats.budgetCzk) : ""} />
        <MetricCard label="Auto plán" value={`${Math.round(stats.auto)} h`} />
        <MetricCard label="Po úprave" value={`${Math.round(stats.manual)} h`} />
        <MetricCard
          label="Zostatok"
          value={`${Math.round(stats.zostatok)} h`}
          accent={lowBudget ? "#B65D05" : undefined}
          warning={lowBudget}
        />
      </div>

      {lowBudget && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Budget na hranici</div>
            <div className="text-xs">Konzultuj s PM alebo technológom. Skontroluj položky s najväčšou odchýlkou.</div>
          </div>
        </div>
      )}

      {!projectRow && <div className="text-sm text-muted-foreground">Žiaden projekt v TPV pipeline.</div>}

      {projectRow && (
        <div className="rounded-lg border bg-card flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto rounded-t-lg">
            <Table style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="bg-primary/5 hover:bg-primary/5">
                  <TableHead className="font-semibold text-foreground">Kód prvku</TableHead>
                  <TableHead className="font-semibold text-foreground">Název prvku</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Auto plán</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Manuálny zásah</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Rozdiel</TableHead>
                  <TableHead className="font-semibold text-foreground">Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRow.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Žádné položky
                    </TableCell>
                  </TableRow>
                ) : (
                  projectRow.items.map((item) => {
                    const prep = projectRow.prepByItemId.get(item.id);
                    const auto = Number((item as any).hodiny_plan ?? 0);
                    const manual = prep?.hodiny_manual != null ? Number(prep.hodiny_manual) : null;
                    const effective = manual != null ? manual : auto;
                    const diff = effective - auto;
                    const ratio = auto > 0 ? Math.abs(diff) / auto : 0;
                    const big = ratio > 0.5;
                    const status = manual == null || manual === auto ? "ok" : big ? "big" : "edited";

                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          "hover:bg-muted/50 transition-colors h-9",
                          big && "bg-[#FCEBEB] hover:bg-[#FADADA]",
                        )}
                      >
                        <TableCell className="text-sm font-semibold px-2">{(item as any).item_code ?? "—"}</TableCell>
                        <TableCell className="text-xs px-2 truncate">{(item as any).nazev ?? ""}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground px-2">{auto} h</TableCell>
                        <TableCell className="px-2">
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              step="0.5"
                              defaultValue={manual ?? ""}
                              placeholder={String(auto)}
                              onBlur={(e) => {
                                const v = e.target.value === "" ? null : Number(e.target.value);
                                if (v === manual) return;
                                upsert.mutate({
                                  tpv_item_id: item.id,
                                  project_id: projectRow.project.project_id,
                                  patch: { hodiny_manual: v },
                                });
                              }}
                              className="h-7 text-right tabular-nums w-24"
                              style={{
                                border: manual != null && manual !== auto ? "1px solid #378ADD" : "1px solid transparent",
                                background: "transparent",
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums text-xs px-2"
                          style={{
                            color: diff === 0 ? "#5F5E5A" : diff > 0 ? "#D97706" : "#DC2626",
                          }}
                        >
                          {diff > 0 ? "+" : ""}{diff} h
                        </TableCell>
                        <TableCell className="text-xs px-2">
                          {status === "big" ? <span className="text-red-700 font-medium">Veľká odchýlka</span>
                            : status === "edited" ? <span className="text-blue-700">Upravené</span>
                            : <span className="text-muted-foreground">OK</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center gap-6 px-3 py-2 border-t text-sm bg-muted/10">
            <div>Celkom: <span className="font-medium tabular-nums">{Math.round(stats.manual)} h</span></div>
            <div>Budget: <span className="font-medium tabular-nums">{Math.round(stats.budget)} h</span></div>
            <div>Zostatok: <span className="font-medium tabular-nums" style={lowBudget ? { color: "#D97706" } : undefined}>{Math.round(stats.zostatok)} h</span></div>
          </div>

          <HoursWorkflowBar
            projectId={projectRow.project.project_id}
            items={projectRow.items.map((item) => {
              const prep = projectRow.prepByItemId.get(item.id);
              const auto = Number((item as any).hodiny_plan ?? 0);
              const manual = prep?.hodiny_manual != null ? Number(prep.hodiny_manual) : null;
              return { tpv_item_id: item.id, hodiny_effective: manual ?? auto };
            })}
          />
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label, value, sub, accent, warning,
}: { label: string; value: string; sub?: string; accent?: string; warning?: boolean }) {
  return (
    <Card
      className={cn("p-4 shadow-sm")}
      style={warning ? { borderColor: "#D97706", borderWidth: 1, borderStyle: "solid", background: "#FFF8EE" } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        {warning && <AlertTriangle className="h-3 w-3 text-amber-600" />}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
