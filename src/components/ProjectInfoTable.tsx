import { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
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
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";

const PROJECT_INFO_COLUMNS = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "klient", label: "Klient" },
  { key: "pm", label: "PM" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "kalkulant", label: "Kalkulant" },
  { key: "status", label: "Status" },
  { key: "datum_smluvni", label: "Datum Smluvní" },
  { key: "prodejni_cena", label: "Prodejní cena" },
  { key: "marze", label: "Marže" },
  { key: "fakturace", label: "Fakturace" },
];

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
}

export function ProjectInfoTable({ personFilter, statusFilter, search: externalSearch }: ProjectInfoTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const [datumWarning, setDatumWarning] = useState(false);
  const qc = useQueryClient();
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);
  const { isVisible, toggleColumn, columns } = useColumnVisibility("col-vis-project-info", PROJECT_INFO_COLUMNS);
  const { getLabel, isCustom, updateLabel, resetLabel } = useColumnLabels("project-info");
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck();
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

  const sh = { sortCol, sortDir, onSort: toggleSort, onRename: (key: string, name: string) => updateLabel.mutate({ columnKey: key, label: name }), onResetLabel: (key: string) => resetLabel.mutate({ columnKey: key }) };
  const v = isVisible;
  const cl = (key: string, def: string) => ({ customLabel: getLabel(key, def), isCustom: isCustom(key) });

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-primary/5">
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} {...cl("project_id", "Project ID")} className="w-[130px] min-w-[130px]" />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} {...cl("project_name", "Project Name")} className="w-[180px] min-w-[180px]" />}
              {v("klient") && <SortableHeader label="Klient" column="klient" {...sh} {...cl("klient", "Klient")} className="w-[120px] min-w-[120px]" />}
              {v("pm") && <SortableHeader label="PM" column="pm" {...sh} {...cl("pm", "PM")} className="w-[140px] min-w-[140px]" />}
              {v("konstrukter") && <SortableHeader label="Konstruktér" column="konstrukter" {...sh} {...cl("konstrukter", "Konstruktér")} className="w-[140px] min-w-[140px]" />}
              {v("kalkulant") && <SortableHeader label="Kalkulant" column="kalkulant" {...sh} {...cl("kalkulant", "Kalkulant")} className="w-[140px] min-w-[140px]" />}
              {v("status") && <SortableHeader label="Status" column="status" {...sh} {...cl("status", "Status")} className="w-[110px] min-w-[110px]" />}
              {v("datum_smluvni") && <SortableHeader label="Datum Smluvní" column="datum_smluvni" {...sh} {...cl("datum_smluvni", "Datum Smluvní")} className="w-[90px] min-w-[90px]" />}
              {v("prodejni_cena") && <SortableHeader label="Prodejní cena" column="prodejni_cena" {...sh} {...cl("prodejni_cena", "Prodejní cena")} className="w-[140px] min-w-[140px] text-right" />}
              {v("marze") && <SortableHeader label="Marže" column="marze" {...sh} {...cl("marze", "Marže")} className="w-[80px] min-w-[80px] text-right" />}
              {v("fakturace") && <SortableHeader label="Fakturace" column="fakturace" {...sh} {...cl("fakturace", "Fakturace")} className="w-[90px] min-w-[90px] text-right" />}
              <ColumnVisibilityToggle columns={columns} isVisible={isVisible} toggleColumn={toggleColumn} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                {v("project_id") && (
                  <TableCell className="font-mono text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => setEditProject(p)}>
                    {p.project_id}
                  </TableCell>
                )}
                {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" /></TableCell>}
                {v("klient") && <TableCell><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} /></TableCell>}
                {v("pm") && <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} /></TableCell>}
                {v("konstrukter") && <TableCell><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(val) => save(p.id, "konstrukter", val, p.konstrukter || "")} /></TableCell>}
                {v("kalkulant") && <TableCell><InlineEditableCell value={p.kalkulant} type="people" peopleRole="Kalkulant" onSave={(val) => save(p.id, "kalkulant", val, p.kalkulant || "")} /></TableCell>}
                {v("status") && (
                  <TableCell>
                    <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                  </TableCell>
                )}
                {v("datum_smluvni") && <TableCell><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(val) => save(p.id, "datum_smluvni", val, p.datum_smluvni || "")} /></TableCell>}
                {v("prodejni_cena") && (
                  <TableCell className="text-right">
                    <CurrencyEditCell value={p.prodejni_cena} currency={p.currency || "CZK"} onSave={(amount, currency) => saveCurrency(p.id, amount, currency, String(p.prodejni_cena ?? ""), p.currency || "CZK")} />
                  </TableCell>
                )}
                {v("marze") && <TableCell className="text-right"><InlineEditableCell value={p.marze} onSave={(val) => save(p.id, "marze", val, p.marze || "")} /></TableCell>}
                {v("fakturace") && <TableCell className="text-right"><InlineEditableCell value={p.fakturace} onSave={(val) => save(p.id, "fakturace", val, p.fakturace || "")} /></TableCell>}
                <TableCell className="w-10" />
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
              <Label>Project ID <span className="text-orange-500">*</span></Label>
              <Input
                value={newProj.project_id}
                onChange={(e) => { setNewProj(s => ({ ...s, project_id: e.target.value })); resetIdCheck(); }}
                onBlur={() => checkProjectId(newProj.project_id)}
              />
              {idExists && <p className="text-xs text-destructive mt-1">Toto ID již existuje</p>}
            </div>
            <div>
              <Label>Datum Smluvní <span className="text-foreground font-bold">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newProj.datum_smluvni && "text-muted-foreground", datumWarning && "border-destructive")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newProj.datum_smluvni || "Vyberte datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                  <Calendar
                    mode="single"
                    selected={newProj.datum_smluvni ? parseAppDate(newProj.datum_smluvni) : undefined}
                    onSelect={(d) => {
                      if (d) {
                        setNewProj(s => ({ ...s, datum_smluvni: formatAppDate(d) }));
                        setDatumWarning(false);
                      }
                    }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {datumWarning && <p className="text-xs text-destructive mt-1">Datum smluvní je povinné</p>}
            </div>

            <div><Label>Project Name <span className="text-orange-500">*</span></Label><Input value={newProj.project_name} onChange={(e) => setNewProj(s => ({ ...s, project_name: e.target.value }))} /></div>
            <div>
              <Label>PM</Label>
              <PeopleSelectDropdown role="PM" value={newProj.pm} onValueChange={(val) => setNewProj(s => ({ ...s, pm: val }))} placeholder="Vyberte PM" />
            </div>

            <div><Label>Klient</Label><Input value={newProj.klient} onChange={(e) => setNewProj(s => ({ ...s, klient: e.target.value }))} /></div>
            <div>
              <Label>Konstruktér</Label>
              <PeopleSelectDropdown role="Konstruktér" value={newProj.konstrukter} onValueChange={(val) => setNewProj(s => ({ ...s, konstrukter: val }))} placeholder="Vyberte konstruktéra" />
            </div>

            <div>
              <Label>Status</Label>
              <Select value={newProj.status} onValueChange={(val) => setNewProj(s => ({ ...s, status: val }))}>
                <SelectTrigger><SelectValue placeholder="Vyberte status" /></SelectTrigger>
                <SelectContent className="z-[99999]">
                  {statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kalkulant</Label>
              <PeopleSelectDropdown role="Kalkulant" value={newProj.kalkulant} onValueChange={(val) => setNewProj(s => ({ ...s, kalkulant: val }))} placeholder="Vyberte kalkulanta" />
            </div>

            <div className="col-span-2">
              <Label>Prodejní cena</Label>
              <div className="flex items-center gap-1">
                <Input type="number" className="no-spinners" value={newProj.prodejni_cena} onChange={(e) => setNewProj(s => ({ ...s, prodejni_cena: e.target.value }))} />
                <Button type="button" variant="outline" size="sm" className="h-10 px-3 font-mono shrink-0" onClick={() => setNewProj(s => ({ ...s, currency: s.currency === "CZK" ? "EUR" : "CZK" }))}>
                  {newProj.currency}
                </Button>
              </div>
            </div>
            <div className="col-span-2">
              <Label>Marže</Label>
              <div className="flex items-center gap-1">
                <Input type="number" className="no-spinners" value={newProj.marze} onChange={(e) => setNewProj(s => ({ ...s, marze: e.target.value }))} placeholder="0" />
                <span className="text-sm text-muted-foreground shrink-0">%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetIdCheck(); }}>Zrušit</Button>
            <Button onClick={handleAddProject} disabled={!newProj.project_id || !newProj.project_name || idExists}>
              {datumWarning && !newProj.datum_smluvni ? "Přesto vytvořit" : "Vytvořit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectEditDialog
        project={editProject}
        open={!!editProject}
        onOpenChange={(open) => { if (!open) setEditProject(null); }}
      />
    </div>
  );
}
