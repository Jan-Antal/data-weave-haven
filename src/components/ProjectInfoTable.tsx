import { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { ProjectEditDialog } from "./ProjectEditDialog";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility } from "./ColumnVisibilityContext";
import { renderCrossTabHeaders, renderCrossTabCells } from "./CrossTabColumns";

const emptyProject = {
  project_id: "",
  project_name: "",
  klient: "",
  pm: "",
  konstrukter: "",
  kalkulant: "",
  status: "Příprava",
  datum_smluvni: "",
  prodejni_cena: "",
  currency: "CZK",
  marze: "",
  fakturace: "",
};

interface ProjectInfoTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

const DATE_COL: React.CSSProperties = { width: 100, minWidth: 100, maxWidth: 100 };
const DEFAULT_STYLES: Record<string, React.CSSProperties> = {
  project_id: { width: 90, minWidth: 90 },
  project_name: { minWidth: 180 },
  klient: { minWidth: 100 },
  location: { minWidth: 100 },
  kalkulant: { minWidth: 110 },
  architekt: { minWidth: 110 },
  datum_smluvni: DATE_COL,
  datum_objednavky: DATE_COL,
  prodejni_cena: { width: 120, minWidth: 110 },
  marze: { width: 70, minWidth: 60 },
  link_cn: { minWidth: 120 },
};

export function ProjectInfoTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: ProjectInfoTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const [datumWarning, setDatumWarning] = useState(false);
  const qc = useQueryClient();
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);
  const { projectInfo: { isVisible, columns } } = useAllColumnVisibility();
  const NATIVE_KEYS = ["project_id", "project_name", "klient", "location", "kalkulant", "architekt", "datum_smluvni", "datum_objednavky", "prodejni_cena", "marze", "link_cn"];
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck();
  const { getLabel, getWidth, updateLabel, updateWidth } = useColumnLabels("project-info");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns, canDeleteProject, isViewer } = useAuth();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);

  useEffect(() => {
    const handleOpenAdd = () => setAddOpen(true);
    document.addEventListener("open-add-project", handleOpenAdd);
    return () => document.removeEventListener("open-add-project", handleOpenAdd);
  }, []);

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  const saveCurrency = (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => {
    const parsedAmount = amount === "" ? null : Number(amount);
    supabase.from("projects").update({ prodejni_cena: parsedAmount, currency } as any).eq("id", id).then(({ error }) => {
      if (error) {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      } else {
        qc.invalidateQueries({ queryKey: ["projects"] });
        toast({ title: "Uloženo" });
      }
    });
  };

  const handleAddProject = async () => {
    if (!newProj.project_id || !newProj.project_name) return;
    if (!newProj.datum_smluvni && !datumWarning) {
      setDatumWarning(true);
      return;
    }
    const { error } = await supabase.from("projects").insert({
      project_id: newProj.project_id,
      project_name: newProj.project_name,
      klient: newProj.klient || null,
      pm: newProj.pm || null,
      konstrukter: newProj.konstrukter || null,
      kalkulant: newProj.kalkulant || null,
      status: newProj.status || null,
      datum_smluvni: newProj.datum_smluvni || null,
      prodejni_cena: newProj.prodejni_cena ? Number(newProj.prodejni_cena) : null,
      currency: newProj.currency || "CZK",
      marze: newProj.marze || null,
      fakturace: newProj.fakturace || null,
    });
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Projekt vytvořen" });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
      setNewProj({ ...emptyProject });
      setDatumWarning(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const sh = { sortCol, sortDir, onSort: toggleSort };
  const v = isVisible;

  const colStyle = (key: string) => {
    const w = getWidth(key);
    const base = DEFAULT_STYLES[key] || {};
    return w ? { ...base, width: w, minWidth: w } : base;
  };

  const editProps = (key: string, defaultLabel: string) => ({
    editMode,
    customLabel: getLabel(key, defaultLabel),
    onLabelChange: (newLabel: string) => updateLabel(key, newLabel),
    onWidthChange: (newWidth: number) => updateWidth(key, newWidth),
  });

  return (
    <div>
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}
      <div className={cn("rounded-lg border bg-card overflow-x-scroll always-scrollbar", editMode && "rounded-t-none border-t-0")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead style={{ minWidth: 32, width: 32 }} className="shrink-0"></TableHead>
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} style={colStyle("project_id")} {...editProps("project_id", "Project ID")} />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} style={colStyle("project_name")} {...editProps("project_name", "Project Name")} />}
              {v("klient") && <SortableHeader label="Klient" column="klient" {...sh} style={colStyle("klient")} {...editProps("klient", "Klient")} />}
              {v("location") && <SortableHeader label="Lokace" column="location" {...sh} style={colStyle("location")} {...editProps("location", "Lokace")} />}
              {v("kalkulant") && <SortableHeader label="Kalkulant" column="kalkulant" {...sh} style={colStyle("kalkulant")} {...editProps("kalkulant", "Kalkulant")} />}
              {v("architekt") && <SortableHeader label="Architekt" column="architekt" {...sh} style={colStyle("architekt")} {...editProps("architekt", "Architekt")} />}
              {v("datum_smluvni") && <SortableHeader label="Datum Smluvní" column="datum_smluvni" {...sh} style={colStyle("datum_smluvni")} {...editProps("datum_smluvni", "Datum Smluvní")} />}
              {v("datum_objednavky") && <SortableHeader label="Datum Objednávky" column="datum_objednavky" {...sh} style={colStyle("datum_objednavky")} {...editProps("datum_objednavky", "Datum Objednávky")} />}
              {v("prodejni_cena") && <SortableHeader label="Prodejní cena" column="prodejni_cena" {...sh} className="text-right" style={colStyle("prodejni_cena")} {...editProps("prodejni_cena", "Prodejní cena")} />}
              {v("marze") && <SortableHeader label="Marže" column="marze" {...sh} className="text-right" style={colStyle("marze")} {...editProps("marze", "Marže")} />}
              {v("link_cn") && <SortableHeader label="CN" column="link_cn" {...sh} style={colStyle("link_cn")} {...editProps("link_cn", "CN")} />}
              {renderCrossTabHeaders({ nativeKeys: NATIVE_KEYS, isVisible: v, sortCol, sortDir, onSort: toggleSort, getLabel, getWidth, editMode, updateLabel, updateWidth })}
              <ColumnVisibilityToggle tabKey="projectInfo" editMode={editMode} onToggleEditMode={canEditColumns ? () => setEditMode(!editMode) : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors" style={(() => { const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null; return c ? { backgroundColor: c } : {}; })()}>
                <TableCell style={{ minWidth: 32, width: 32 }} />
                {v("project_id") && (
                  <TableCell className="font-mono text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => setEditProject(p)}>
                    {p.project_id}
                  </TableCell>
                )}
                {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
                {v("klient") && <TableCell><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} readOnly={!canEdit} /></TableCell>}
                {v("location") && <TableCell><InlineEditableCell value={p.location} onSave={(val) => save(p.id, "location", val, p.location || "")} readOnly={!canEdit} /></TableCell>}
                {v("kalkulant") && <TableCell><InlineEditableCell value={p.kalkulant} type="people" peopleRole="Kalkulant" onSave={(val) => save(p.id, "kalkulant", val, p.kalkulant || "")} readOnly={!canEdit} /></TableCell>}
                {v("architekt") && <TableCell><InlineEditableCell value={p.architekt} onSave={(val) => save(p.id, "architekt", val, p.architekt || "")} readOnly={!canEdit} /></TableCell>}
                {v("datum_smluvni") && <TableCell><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(val) => save(p.id, "datum_smluvni", val, p.datum_smluvni || "")} readOnly={!canEdit} /></TableCell>}
                {v("datum_objednavky") && <TableCell><InlineEditableCell value={p.datum_objednavky} type="date" onSave={(val) => save(p.id, "datum_objednavky", val, p.datum_objednavky || "")} readOnly={!canEdit} /></TableCell>}
                {v("prodejni_cena") && (
                  <TableCell className="text-right">
                    <CurrencyEditCell value={p.prodejni_cena} currency={p.currency || "CZK"} onSave={(amount, currency) => saveCurrency(p.id, amount, currency, String(p.prodejni_cena ?? ""), p.currency || "CZK")} />
                  </TableCell>
                )}
                {v("marze") && <TableCell className="text-right"><InlineEditableCell value={p.marze} onSave={(val) => save(p.id, "marze", val, p.marze || "")} readOnly={!canEdit} /></TableCell>}
                {v("link_cn") && <TableCell><InlineEditableCell value={p.link_cn} onSave={(val) => save(p.id, "link_cn", val, p.link_cn || "")} readOnly={!canEdit} /></TableCell>}
                {renderCrossTabCells({ nativeKeys: NATIVE_KEYS, isVisible: v, project: p, save, canEdit, statusLabels, saveCurrency })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Nový projekt</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <Label>Project ID <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input
                value={newProj.project_id}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewProj((p) => ({ ...p, project_id: val }));
                  if (val.length >= 2) checkProjectId(val);
                  else resetIdCheck();
                }}
                className={idExists ? "border-destructive" : ""}
              />
              {idExists && <p className="text-destructive text-xs mt-1">Toto ID již existuje</p>}
            </div>
            <div>
              <Label>Project Name <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input value={newProj.project_name} onChange={(e) => setNewProj((p) => ({ ...p, project_name: e.target.value }))} />
            </div>
            <div>
              <Label>Klient</Label>
              <Input value={newProj.klient} onChange={(e) => setNewProj((p) => ({ ...p, klient: e.target.value }))} />
            </div>
            <div>
              <Label>PM</Label>
              <PeopleSelectDropdown value={newProj.pm} onValueChange={(val) => setNewProj((p) => ({ ...p, pm: val }))} role="PM" />
            </div>
            <div>
              <Label>Konstruktér</Label>
              <PeopleSelectDropdown value={newProj.konstrukter} onValueChange={(val) => setNewProj((p) => ({ ...p, konstrukter: val }))} role="Konstruktér" />
            </div>
            <div>
              <Label>Kalkulant</Label>
              <PeopleSelectDropdown value={newProj.kalkulant} onValueChange={(val) => setNewProj((p) => ({ ...p, kalkulant: val }))} role="Kalkulant" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={newProj.status} onValueChange={(val) => setNewProj((p) => ({ ...p, status: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusLabels.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Datum smluvní</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newProj.datum_smluvni && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newProj.datum_smluvni ? formatAppDate(parseAppDate(newProj.datum_smluvni)!) : "Vyberte datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                  <Calendar mode="single" selected={newProj.datum_smluvni ? parseAppDate(newProj.datum_smluvni) : undefined} onSelect={(date) => { if (date) { const iso = date.toISOString().split("T")[0]; setNewProj((p) => ({ ...p, datum_smluvni: iso })); } }} />
                </PopoverContent>
              </Popover>
              {datumWarning && <p className="text-[hsl(var(--accent))] text-xs mt-1">Datum smluvní není vyplněn. Klikněte znovu pro uložení bez data.</p>}
            </div>
            <div>
              <Label>Prodejní cena</Label>
              <Input type="number" value={newProj.prodejni_cena} onChange={(e) => setNewProj((p) => ({ ...p, prodejni_cena: e.target.value }))} />
            </div>
            <div>
              <Label>Měna</Label>
              <Select value={newProj.currency} onValueChange={(val) => setNewProj((p) => ({ ...p, currency: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marže</Label>
              <Input value={newProj.marze} onChange={(e) => setNewProj((p) => ({ ...p, marze: e.target.value }))} />
            </div>
            <div>
              <Label>Fakturace</Label>
              <Input value={newProj.fakturace} onChange={(e) => setNewProj((p) => ({ ...p, fakturace: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setAddOpen(false); setDatumWarning(false); resetIdCheck(); }}>Zrušit</Button>
            <Button onClick={handleAddProject} disabled={!newProj.project_id || !newProj.project_name || idExists}>Vytvořit projekt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editProject && <ProjectEditDialog project={editProject} open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }} />}
    </div>
  );
}
