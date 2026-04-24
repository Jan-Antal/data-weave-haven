import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Save, Send, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getProjectColor } from "@/lib/projectColors";
import { TpvStatusBadge } from "./TpvStatusBadge";
import { useTpvPipelineProjects, type TpvProjectRow } from "@/hooks/useTpvPipelineProjects";
import { useUpsertTpvPreparation } from "@/hooks/useTpvPreparation";
import { aggregateMaterialStav, type ReadinessStatus } from "@/lib/tpvReadiness";
import { toast } from "@/hooks/use-toast";

type Filter = "all" | "blokovane" | "riziko" | "ready";

export function TpvSummaryTab() {
  const { rows, isLoading } = useTpvPipelineProjects();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: rows.length, ready: 0, riziko: 0, blokovane: 0 };
    for (const r of rows) {
      if (r.projectReadiness === "ready") c.ready += 1;
      else if (r.projectReadiness === "riziko") c.riziko += 1;
      else if (r.projectReadiness === "blokovane") c.blokovane += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.projectReadiness === filter);
  }, [rows, filter]);

  return (
    <div className="p-4 space-y-4 overflow-auto h-full bg-background">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="V pipeline" value={counts.all} />
        <MetricCard label="Ready" value={counts.ready} accent="#27500A" />
        <MetricCard label="Rizikové" value={counts.riziko} accent="#B65D05" />
        <MetricCard label="Blokované" value={counts.blokovane} accent="#B1232F" />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        {(["all", "blokovane", "riziko", "ready"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "Všetky" : f === "blokovane" ? "Blokované" : f === "riziko" ? "Rizikové" : "Ready"}
          </button>
        ))}
      </div>

      {/* Project pipeline table */}
      <div className="border border-border rounded-md overflow-hidden">
        <div
          className="grid items-center px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted font-medium"
          style={{ gridTemplateColumns: "minmax(280px,2fr) 160px 110px 130px 110px 130px 36px" }}
        >
          <div>Projekt</div>
          <div>Termín výroby</div>
          <div>Dokumentácia</div>
          <div>Materiál</div>
          <div>Hodiny</div>
          <div>Stav</div>
          <div />
        </div>

        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Načítam…</div>}

        {!isLoading && visible.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Žiadne projekty.</div>
        )}

        {visible.map((row) => (
          <ProjectRow
            key={row.project.project_id}
            row={row}
            expanded={expandedId === row.project.project_id}
            onToggle={() =>
              setExpandedId((cur) => (cur === row.project.project_id ? null : row.project.project_id))
            }
          />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className="text-2xl font-bold mt-1 tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </Card>
  );
}

function ProjectRow({
  row,
  expanded,
  onToggle,
}: {
  row: TpvProjectRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const projectColor = getProjectColor(row.project.project_id);
  const aggregateMatStav = (() => {
    const all: { stav: any }[] = [];
    row.materialsByItemId.forEach((arr) => arr.forEach((m) => all.push({ stav: m.stav })));
    return aggregateMaterialStav(all);
  })();

  const days = row.daysToDeadline;
  const dateStr = row.deadline?.date.toLocaleDateString("cs-CZ");
  const dateColor = days == null ? undefined : days < 14 ? "#DC2626" : days < 30 ? "#D97706" : undefined;

  return (
    <>
      <div
        onClick={onToggle}
        className="grid items-center px-4 py-3 text-sm border-t border-border hover:bg-muted/50 cursor-pointer"
        style={{
          gridTemplateColumns: "minmax(280px,2fr) 160px 110px 130px 110px 130px 36px",
          borderLeft: `3px solid ${projectColor}`,
        }}
      >
        <div className="min-w-0">
          <div className="font-medium truncate">{row.project.project_name}</div>
          <div className="text-[11px] text-muted-foreground">
            {row.project.project_id} · {row.itemCount} položiek
          </div>
        </div>
        <div className="text-sm">
          {dateStr ? (
            <div>
              <div style={dateColor ? { color: dateColor } : undefined}>{dateStr}</div>
              {days != null && (
                <div
                  className="text-[11px]"
                  style={dateColor ? { color: dateColor } : { color: "#5F5E5A" }}
                >
                  {days >= 0 ? `${days} dní` : `${Math.abs(days)} dní po`}
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="tabular-nums">
          {row.docOkCount}/{row.itemCount}
        </div>
        <div className="text-sm" style={{ color: aggregateMatStav.color }}>
          {aggregateMatStav.label}
        </div>
        <div className="tabular-nums text-sm">
          {Math.round(row.totalEffectiveHours)} h
        </div>
        <div>
          <TpvStatusBadge status={row.projectReadiness} />
        </div>
        <div className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {expanded && <ProjectDetailPanel row={row} />}
    </>
  );
}

function ProjectDetailPanel({ row }: { row: TpvProjectRow }) {
  const upsertPrep = useUpsertTpvPreparation();

  const allReadyOrRiziko = useMemo(
    () =>
      Array.from(row.readinessByItemId.values()).every((s) => s === "ready" || s === "riziko"),
    [row.readinessByItemId],
  );

  const updateField = (
    itemId: string,
    patch: Partial<{ doc_ok: boolean; hodiny_manual: number | null }>,
  ) => {
    upsertPrep.mutate({
      tpv_item_id: itemId,
      project_id: row.project.project_id,
      patch,
    });
  };

  return (
    <div className="bg-muted/30 border-t border-border px-6 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-base font-medium">{row.project.project_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.project.project_id} · termín {row.deadline?.date.toLocaleDateString("cs-CZ") ?? "—"} ·{" "}
            {Math.round(row.totalEffectiveHours)} h celkom
          </div>
        </div>
        <TpvStatusBadge status={row.projectReadiness} />
      </div>

      <div className="bg-background border border-border rounded-md overflow-hidden">
        <div
          className="grid items-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted font-medium"
          style={{ gridTemplateColumns: "120px minmax(200px,2fr) 80px 130px 100px 130px" }}
        >
          <div>Kód</div>
          <div>Názov</div>
          <div className="text-center">Výkres</div>
          <div>Materiál</div>
          <div className="text-right">Hodiny</div>
          <div>Stav</div>
        </div>

        {row.items.map((item) => {
          const prep = row.prepByItemId.get(item.id);
          const mats = row.materialsByItemId.get(item.id) ?? [];
          const readiness: ReadinessStatus = row.readinessByItemId.get(item.id) ?? "rozpracovane";
          const docOk = prep?.doc_ok ?? false;
          const auto = Number((item as any).hodiny_plan ?? 0);
          const manual = prep?.hodiny_manual != null ? Number(prep.hodiny_manual) : null;
          const matAgg = aggregateMaterialStav(mats);

          return (
            <div
              key={item.id}
              className="grid items-center px-3 py-2 text-sm border-t border-border"
              style={{ gridTemplateColumns: "120px minmax(200px,2fr) 80px 130px 100px 130px" }}
            >
              <div className="text-xs font-bold">{(item as any).item_code ?? "—"}</div>
              <div className="truncate">{(item as any).nazev ?? "—"}</div>
              <div className="flex justify-center">
                <button
                  onClick={() => updateField(item.id, { doc_ok: !docOk })}
                  title={docOk ? "Dokumentácia OK" : "Dokumentácia chýba"}
                  className="p-1"
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: docOk ? "#639922" : "#E24B4A",
                    }}
                  />
                </button>
              </div>
              <div className="text-xs" style={{ color: matAgg.color }}>
                {matAgg.label}
              </div>
              <div className="text-right">
                <Input
                  type="number"
                  step="0.5"
                  defaultValue={manual ?? auto}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v === manual) return;
                    if (v === auto && manual == null) return;
                    updateField(item.id, { hodiny_manual: v });
                  }}
                  className="h-7 text-right tabular-nums w-20 ml-auto"
                  style={{
                    border: manual != null && manual !== auto ? "1px solid #378ADD" : "none",
                    background: "transparent",
                  }}
                />
              </div>
              <div>
                <TpvStatusBadge status={readiness} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-muted-foreground">
          Celkom hodín: <span className="font-medium tabular-nums text-foreground">{Math.round(row.totalEffectiveHours)} h</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Uložené" })}
          >
            <Save className="h-4 w-4 mr-1.5" /> Uložiť
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => toast({ title: "Odoslané rizikovo", description: row.project.project_name })}
          >
            <AlertTriangle className="h-4 w-4 mr-1.5" /> Odoslať rizikovo
          </Button>
          <Button
            size="sm"
            disabled={!allReadyOrRiziko}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            onClick={() => toast({ title: "Odoslané do výroby", description: row.project.project_name })}
          >
            <Send className="h-4 w-4 mr-1.5" /> Odoslať do výroby
          </Button>
        </div>
      </div>
    </div>
  );
}
