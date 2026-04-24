import { useMemo, useState } from "react";
import { AlertTriangle, Save, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTpvPipelineProjects } from "@/hooks/useTpvPipelineProjects";
import { useUpsertTpvPreparation, useApproveAllHours } from "@/hooks/useTpvPreparation";
import { toast } from "@/hooks/use-toast";

const DEFAULT_PRODUCTION_PCT = 25;

function formatCzk(n: number): string {
  return Math.round(n).toLocaleString("cs-CZ").replace(/,/g, " ") + " Kč";
}

export function TpvHoursTab() {
  const { rows } = useTpvPipelineProjects();
  const [projectId, setProjectId] = useState<string>("");
  const upsert = useUpsertTpvPreparation();
  const approveAll = useApproveAllHours();

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
        <div className="border border-border rounded-md overflow-hidden">
          <div
            className="grid px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted font-medium"
            style={{ gridTemplateColumns: "120px minmax(220px,2fr) 100px 130px 100px 140px" }}
          >
            <div>Kód</div>
            <div>Názov</div>
            <div className="text-right">Auto</div>
            <div className="text-right">Manuálny zásah</div>
            <div className="text-right">Rozdiel</div>
            <div>Stav</div>
          </div>

          {projectRow.items.map((item) => {
            const prep = projectRow.prepByItemId.get(item.id);
            const auto = Number((item as any).hodiny_plan ?? 0);
            const manual = prep?.hodiny_manual != null ? Number(prep.hodiny_manual) : null;
            const effective = manual != null ? manual : auto;
            const diff = effective - auto;
            const ratio = auto > 0 ? Math.abs(diff) / auto : 0;
            const big = ratio > 0.5;
            const status = manual == null || manual === auto ? "ok" : big ? "big" : "edited";

            return (
              <div
                key={item.id}
                className={cn(
                  "grid items-center px-3 py-2 text-sm border-t border-border",
                  big && "bg-[#FCEBEB]"
                )}
                style={{ gridTemplateColumns: "120px minmax(220px,2fr) 100px 130px 100px 140px" }}
              >
                <div className="font-mono text-xs">{(item as any).item_code ?? "—"}</div>
                <div className="truncate">{(item as any).nazev ?? ""}</div>
                <div className="text-right tabular-nums text-muted-foreground">{auto} h</div>
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
                <div
                  className="text-right tabular-nums"
                  style={{
                    color: diff === 0 ? "#5F5E5A" : diff > 0 ? "#D97706" : "#DC2626",
                  }}
                >
                  {diff > 0 ? "+" : ""}{diff} h
                </div>
                <div className="text-xs">
                  {status === "big" ? <span className="text-red-700 font-medium">Veľká odchýlka</span>
                    : status === "edited" ? <span className="text-blue-700">Upravené</span>
                    : <span className="text-muted-foreground">OK</span>}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-3 py-3 border-t border-border bg-muted/30">
            <div className="text-sm flex gap-6">
              <div>Celkom: <span className="font-medium tabular-nums">{Math.round(stats.manual)} h</span></div>
              <div>Budget: <span className="font-medium tabular-nums">{Math.round(stats.budget)} h</span></div>
              <div>Zostatok: <span className="font-medium tabular-nums" style={lowBudget ? { color: "#D97706" } : undefined}>{Math.round(stats.zostatok)} h</span></div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toast({ title: "Uložené" })}>
                <Save className="h-4 w-4 mr-1.5" /> Uložiť
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => approveAll.mutate({
                  projectId: projectRow.project.project_id,
                  items: projectRow.items.map((i) => ({ tpv_item_id: i.id })),
                })}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Schváliť hodiny
              </Button>
            </div>
          </div>
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
