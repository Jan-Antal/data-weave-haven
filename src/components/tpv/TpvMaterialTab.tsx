import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTpvPipelineProjects } from "@/hooks/useTpvPipelineProjects";
import {
  useTpvMaterialAll,
  useInsertTpvMaterial,
  useUpdateTpvMaterial,
  useDeleteTpvMaterial,
  type TpvMaterial,
} from "@/hooks/useTpvMaterial";
import { useAllTPVItems } from "@/hooks/useAllTPVItems";

type ViewMode = "per-project" | "per-material";

const STAV_LABEL: Record<TpvMaterial["stav"], string> = {
  nezadany: "Nezadané",
  objednane: "Objednané",
  caka: "Čaká",
  dodane: "Dodané",
};

export function TpvMaterialTab() {
  const [view, setView] = useState<ViewMode>("per-project");
  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
        <button
          onClick={() => setView("per-project")}
          className={cn("px-4 py-1.5", view === "per-project" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        >
          Per projekt
        </button>
        <button
          onClick={() => setView("per-material")}
          className={cn("px-4 py-1.5 border-l border-border", view === "per-material" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        >
          Per materiál
        </button>
      </div>
      {view === "per-project" ? <PerProjectView /> : <PerMaterialView />}
    </div>
  );
}

function PerProjectView() {
  const { rows, isLoading } = useTpvPipelineProjects();
  const { data: materials = [] } = useTpvMaterialAll();
  const [projectId, setProjectId] = useState<string>("__all__");
  const [stavFilter, setStavFilter] = useState<string>("__all__");

  const insert = useInsertTpvMaterial();
  const update = useUpdateTpvMaterial();
  const del = useDeleteTpvMaterial();

  const projectRow = rows.find((r) => r.project.project_id === projectId) ?? null;

  const visibleMaterials = useMemo(() => {
    let list = materials;
    if (projectId !== "__all__") list = list.filter((m) => m.project_id === projectId);
    else {
      const pipelineIds = new Set(rows.map((r) => r.project.project_id));
      list = list.filter((m) => pipelineIds.has(m.project_id));
    }
    if (stavFilter !== "__all__") list = list.filter((m) => m.stav === stavFilter);
    return list;
  }, [materials, projectId, stavFilter, rows]);

  // Build item lookup
  const itemLookup = useMemo(() => {
    const m = new Map<string, { code: string; name: string; project_id: string }>();
    for (const r of rows) for (const it of r.items) {
      m.set(it.id, {
        code: (it as any).item_code ?? "—",
        name: (it as any).nazev ?? "",
        project_id: it.project_id,
      });
    }
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[300px]"><SelectValue placeholder="Projekt" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všetky projekty</SelectItem>
            {rows.map((r) => (
              <SelectItem key={r.project.project_id} value={r.project.project_id}>
                {r.project.project_id} — {r.project.project_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stavFilter} onValueChange={setStavFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Stav" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všetky stavy</SelectItem>
            {Object.entries(STAV_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {projectRow && (
        <AddMaterialBar
          items={projectRow.items.map((i) => ({ id: i.id, code: (i as any).item_code ?? "—", name: (i as any).nazev ?? "" }))}
          onAdd={(payload) => insert.mutate({ ...payload, project_id: projectRow.project.project_id })}
        />
      )}

      <div className="border border-border rounded-md overflow-hidden">
        <div
          className="grid px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted font-medium"
          style={{ gridTemplateColumns: "120px minmax(220px,2fr) 110px 80px 140px 110px 110px 130px 32px" }}
        >
          <div>Kód</div>
          <div>Položka / Materiál</div>
          <div>Množstvo</div>
          <div>Jedn.</div>
          <div>Dodávateľ</div>
          <div>Objednané</div>
          <div>Dodané</div>
          <div>Stav</div>
          <div />
        </div>
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Načítam…</div>}
        {!isLoading && visibleMaterials.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Žiaden materiál.</div>
        )}
        {visibleMaterials.map((m) => {
          const it = itemLookup.get(m.tpv_item_id);
          return (
            <div
              key={m.id}
              className="grid items-center px-3 py-2 text-sm border-t border-border hover:bg-muted/50"
              style={{ gridTemplateColumns: "120px minmax(220px,2fr) 110px 80px 140px 110px 110px 130px 32px" }}
            >
              <div className="text-xs">{it?.code ?? "—"}</div>
              <div className="min-w-0">
                <div className="truncate">{m.nazov}</div>
                <div className="text-[11px] text-muted-foreground truncate">{it?.name}</div>
              </div>
              <InlineNumber value={m.mnozstvo} onChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { mnozstvo: v } })} />
              <InlineText value={m.jednotka} onChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { jednotka: v } })} placeholder="ks" />
              <InlineText value={m.dodavatel} onChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { dodavatel: v } })} />
              <InlineDate value={m.objednane_dat} onChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { objednane_dat: v } })} />
              <InlineDate value={m.dodane_dat} onChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { dodane_dat: v } })} />
              <Select value={m.stav} onValueChange={(v) => update.mutate({ id: m.id, project_id: m.project_id, patch: { stav: v as TpvMaterial["stav"] } })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STAV_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
              <button
                onClick={() => del.mutate({ id: m.id, project_id: m.project_id })}
                className="text-muted-foreground hover:text-red-600"
                title="Odstrániť"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddMaterialBar({
  items,
  onAdd,
}: {
  items: { id: string; code: string; name: string }[];
  onAdd: (m: { tpv_item_id: string; nazov: string; mnozstvo?: number | null; jednotka?: string | null; dodavatel?: string | null }) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [nazov, setNazov] = useState("");
  const [mnozstvo, setMnozstvo] = useState("");
  const [jednotka, setJednotka] = useState("");
  const [dodavatel, setDodavatel] = useState("");

  const reset = () => { setNazov(""); setMnozstvo(""); setJednotka(""); setDodavatel(""); };

  return (
    <Card className="p-3 bg-muted/40 border border-dashed border-border">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[200px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Položka</div>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Vyber položku…" /></SelectTrigger>
            <SelectContent>
              {items.map((it) => (
                <SelectItem key={it.id} value={it.id}>{it.code} — {it.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Materiál</div>
          <Input value={nazov} onChange={(e) => setNazov(e.target.value)} className="h-8" placeholder="Napr. MDF 18 mm" />
        </div>
        <div className="w-24">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Množstvo</div>
          <Input value={mnozstvo} onChange={(e) => setMnozstvo(e.target.value)} className="h-8 text-right" type="number" />
        </div>
        <div className="w-20">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Jedn.</div>
          <Input value={jednotka} onChange={(e) => setJednotka(e.target.value)} className="h-8" placeholder="ks" />
        </div>
        <div className="w-40">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Dodávateľ</div>
          <Input value={dodavatel} onChange={(e) => setDodavatel(e.target.value)} className="h-8" />
        </div>
        <Button
          size="sm"
          disabled={!itemId || !nazov.trim()}
          onClick={() => {
            onAdd({
              tpv_item_id: itemId,
              nazov: nazov.trim(),
              mnozstvo: mnozstvo ? Number(mnozstvo) : null,
              jednotka: jednotka || null,
              dodavatel: dodavatel || null,
            });
            reset();
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Pridať
        </Button>
      </div>
    </Card>
  );
}

function InlineNumber({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Input
      type="number"
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const v = e.target.value === "" ? null : Number(e.target.value);
        if (v !== value) onChange(v);
      }}
      className="h-7 text-right text-sm"
    />
  );
}
function InlineText({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <Input
      defaultValue={value ?? ""}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value === "" ? null : e.target.value;
        if (v !== value) onChange(v);
      }}
      className="h-7 text-sm"
    />
  );
}
function InlineDate({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Input
      type="date"
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const v = e.target.value === "" ? null : e.target.value;
        if (v !== value) onChange(v);
      }}
      className="h-7 text-sm"
    />
  );
}

// =================== PER MATERIAL ===================

function PerMaterialView() {
  const { data: materials = [] } = useTpvMaterialAll();
  const { rows } = useTpvPipelineProjects();
  const pipelineIds = useMemo(() => new Set(rows.map((r) => r.project.project_id)), [rows]);
  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.project.project_id, r.project.project_name);
    return m;
  }, [rows]);

  const inPipeline = materials.filter((m) => pipelineIds.has(m.project_id));

  // Group by lower(trim(nazov))
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; nazov: string; dodavatel: string | null; items: TpvMaterial[]; projectIds: Set<string> }>();
    for (const m of inPipeline) {
      const key = m.nazov.trim().toLowerCase();
      let g = map.get(key);
      if (!g) {
        g = { key, nazov: m.nazov, dodavatel: m.dodavatel, items: [], projectIds: new Set() };
        map.set(key, g);
      }
      g.items.push(m);
      g.projectIds.add(m.project_id);
    }
    return Array.from(map.values()).sort((a, b) => a.nazov.localeCompare(b.nazov));
  }, [inPipeline]);

  const metrics = useMemo(() => {
    const unique = groups.length;
    const shared = groups.filter((g) => g.projectIds.size >= 2).length;
    const waiting = inPipeline.filter((m) => m.stav === "nezadany" || m.stav === "objednane" || m.stav === "caka").length;
    return { unique, shared, waiting };
  }, [groups, inPipeline]);

  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Unikátnych materiálov" value={metrics.unique} />
        <MetricCard label="Zdieľané 2+ projektov" value={metrics.shared} accent="#1e40af" />
        <MetricCard label="Čaká na dodanie" value={metrics.waiting} accent="#633806" />
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div
          className="grid px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted font-medium"
          style={{ gridTemplateColumns: "minmax(280px,2fr) 130px 100px 130px" }}
        >
          <div>Materiál / dodávateľ</div>
          <div className="text-right">Celkom</div>
          <div>Projektov</div>
          <div>Stav (agg.)</div>
        </div>

        {groups.map((g) => {
          const total = g.items.reduce((s, m) => s + Number(m.mnozstvo ?? 0), 0);
          const allDelivered = g.items.every((m) => m.stav === "dodane");
          const someWaiting = g.items.some((m) => m.stav === "caka" || m.stav === "nezadany");
          const aggLabel = allDelivered ? "Dodané" : someWaiting ? "Čaká" : "Objednané";
          const aggColor = allDelivered ? "#27500A" : someWaiting ? "#633806" : "#1e40af";
          const open = openKey === g.key;
          const isShared = g.projectIds.size >= 2;
          const maxQty = Math.max(...g.items.map((m) => Number(m.mnozstvo ?? 0)), 1);

          return (
            <div key={g.key}>
              <div
                onClick={() => setOpenKey(open ? null : g.key)}
                className="grid items-center px-3 py-2 text-sm border-t border-border hover:bg-muted/50 cursor-pointer"
                style={{ gridTemplateColumns: "minmax(280px,2fr) 130px 100px 130px" }}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{g.nazov}</div>
                  {g.dodavatel && <div className="text-[11px] text-muted-foreground truncate">{g.dodavatel}</div>}
                </div>
                <div className="text-right tabular-nums">{total.toLocaleString("cs-CZ")}</div>
                <div>
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      backgroundColor: isShared ? "#dbeafe" : "#e5e7eb",
                      color: isShared ? "#1e40af" : "#5F5E5A",
                    }}
                  >
                    {g.projectIds.size} proj.
                  </span>
                </div>
                <div className="text-xs" style={{ color: aggColor }}>{aggLabel}</div>
              </div>
              {open && (
                <div className="bg-muted/30 border-t border-border">
                  {g.items.map((m) => {
                    const qty = Number(m.mnozstvo ?? 0);
                    const pct = (qty / maxQty) * 100;
                    return (
                      <div
                        key={m.id}
                        className="grid items-center px-3 py-1.5 text-xs border-t border-border/60"
                        style={{ gridTemplateColumns: "120px 1fr 110px 100px" }}
                      >
                        <div className="text-muted-foreground">{m.project_id}</div>
                        <div className="px-3">
                          <div className="h-1.5 bg-muted rounded">
                            <div className="h-full rounded bg-primary/60" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {projectName.get(m.project_id) ?? ""}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">{qty.toLocaleString("cs-CZ")} {m.jednotka ?? ""}</div>
                        <div style={{ color: m.stav === "dodane" ? "#27500A" : m.stav === "caka" ? "#633806" : "#5F5E5A" }}>
                          {STAV_LABEL[m.stav]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Žiaden materiál.</div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4 bg-muted border-0 shadow-none">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-medium tabular-nums mt-1" style={accent ? { color: accent } : undefined}>{value}</div>
    </Card>
  );
}
