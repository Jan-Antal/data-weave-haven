import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { statusOrder } from "@/data/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const emptyProject = {
  project_id: "",
  project_name: "",
  klient: "",
  pm: "",
  konstrukter: "",
  status: "",
  datum_smluvni: "",
  prodejni_cena: "",
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
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const qc = useQueryClient();

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
    const { error } = await supabase.from("projects").insert({
      project_id: newProj.project_id,
      project_name: newProj.project_name,
      klient: newProj.klient || null,
      pm: newProj.pm || null,
      konstrukter: newProj.konstrukter || null,
      status: newProj.status || null,
      datum_smluvni: newProj.datum_smluvni || null,
      prodejni_cena: newProj.prodejni_cena ? Number(newProj.prodejni_cena) : null,
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
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const sh = { sortCol, sortDir, onSort: toggleSort };

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-primary/5">
              <SortableHeader label="Project ID" column="project_id" {...sh} className="w-[130px] min-w-[130px]" />
              <SortableHeader label="Project Name" column="project_name" {...sh} className="w-[180px] min-w-[180px]" />
              <SortableHeader label="Klient" column="klient" {...sh} className="w-[120px] min-w-[120px]" />
              <SortableHeader label="PM" column="pm" {...sh} className="w-[140px] min-w-[140px]" />
              <SortableHeader label="Konstruktér" column="konstrukter" {...sh} className="w-[140px] min-w-[140px]" />
              <SortableHeader label="Status" column="status" {...sh} className="w-[110px] min-w-[110px]" />
              <SortableHeader label="Datum Smluvní" column="datum_smluvni" {...sh} className="w-[90px] min-w-[90px]" />
              <SortableHeader label="Prodejní cena" column="prodejni_cena" {...sh} className="w-[140px] min-w-[140px] text-right" />
              <SortableHeader label="Marže" column="marze" {...sh} className="w-[80px] min-w-[80px] text-right" />
              <SortableHeader label="Fakturace" column="fakturace" {...sh} className="w-[90px] min-w-[90px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>
                <TableCell>
                  <InlineEditableCell value={p.project_name} onSave={(v) => save(p.id, "project_name", v, p.project_name)} className="font-medium" />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.klient} onSave={(v) => save(p.id, "klient", v, p.klient || "")} />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(v) => save(p.id, "pm", v, p.pm || "")} />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(v) => save(p.id, "konstrukter", v, p.konstrukter || "")} />
                </TableCell>
                <TableCell>
                  <InlineEditableCell
                    value={p.status}
                    type="select"
                    options={statusOrder}
                    onSave={(v) => save(p.id, "status", v, p.status || "")}
                    displayValue={p.status ? <StatusBadge status={p.status} /> : "—"}
                  />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.datum_smluvni} type="date" onSave={(v) => save(p.id, "datum_smluvni", v, p.datum_smluvni || "")} />
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyEditCell
                    value={p.prodejni_cena}
                    currency={p.currency || "CZK"}
                    onSave={(amount, currency) => saveCurrency(p.id, amount, currency, String(p.prodejni_cena ?? ""), p.currency || "CZK")}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <InlineEditableCell value={p.marze} onSave={(v) => save(p.id, "marze", v, p.marze || "")} />
                </TableCell>
                <TableCell className="text-right">
                  <InlineEditableCell value={p.fakturace} onSave={(v) => save(p.id, "fakturace", v, p.fakturace || "")} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nový projekt</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Project ID *</Label><Input value={newProj.project_id} onChange={(e) => setNewProj(s => ({ ...s, project_id: e.target.value }))} /></div>
            <div><Label>Project Name *</Label><Input value={newProj.project_name} onChange={(e) => setNewProj(s => ({ ...s, project_name: e.target.value }))} /></div>
            <div><Label>Klient</Label><Input value={newProj.klient} onChange={(e) => setNewProj(s => ({ ...s, klient: e.target.value }))} /></div>
            <div><Label>PM</Label><Input value={newProj.pm} onChange={(e) => setNewProj(s => ({ ...s, pm: e.target.value }))} /></div>
            <div><Label>Konstruktér</Label><Input value={newProj.konstrukter} onChange={(e) => setNewProj(s => ({ ...s, konstrukter: e.target.value }))} /></div>
            <div><Label>Status</Label><Input value={newProj.status} onChange={(e) => setNewProj(s => ({ ...s, status: e.target.value }))} /></div>
            <div><Label>Datum Smluvní</Label><Input value={newProj.datum_smluvni} onChange={(e) => setNewProj(s => ({ ...s, datum_smluvni: e.target.value }))} /></div>
            <div><Label>Prodejní cena</Label><Input type="number" className="no-spinners" value={newProj.prodejni_cena} onChange={(e) => setNewProj(s => ({ ...s, prodejni_cena: e.target.value }))} /></div>
            <div><Label>Marže</Label><Input value={newProj.marze} onChange={(e) => setNewProj(s => ({ ...s, marze: e.target.value }))} /></div>
            <div><Label>Fakturace</Label><Input value={newProj.fakturace} onChange={(e) => setNewProj(s => ({ ...s, fakturace: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAddProject} disabled={!newProj.project_id || !newProj.project_name}>Vytvořit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
