import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { TableSearchBar } from "./TableSearchBar";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { statusOrder } from "@/data/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

function formatCurrency(value: number | null, currency: string) {
  if (value === null || value === 0) return "—";
  return new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "cs-CZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

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

export function ProjectInfoTable() {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();
  const { sorted, search, setSearch, sortCol, sortDir, toggleSort } = useSortFilter(projects);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const qc = useQueryClient();

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
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
      <div className="flex items-center justify-between mb-3">
        <TableSearchBar value={search} onChange={setSearch} />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nový projekt
        </Button>
      </div>
      <div className="rounded-lg border bg-card overflow-auto always-scrollbar">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-primary/5">
              <SortableHeader label="Project ID" column="project_id" {...sh} className="w-[120px]" />
              <SortableHeader label="Project Name" column="project_name" {...sh} className="w-[200px]" />
              <SortableHeader label="Klient" column="klient" {...sh} className="w-[130px]" />
              <SortableHeader label="PM" column="pm" {...sh} className="w-[130px]" />
              <SortableHeader label="Konstruktér" column="konstrukter" {...sh} className="w-[130px]" />
              <SortableHeader label="Status" column="status" {...sh} className="w-[110px]" />
              <SortableHeader label="Datum Smluvní" column="datum_smluvni" {...sh} className="w-[110px]" />
              <SortableHeader label="Prodejní cena" column="prodejni_cena" {...sh} className="w-[120px] text-right" />
              <SortableHeader label="Marže" column="marze" {...sh} className="w-[80px] text-right" />
              <SortableHeader label="Fakturace" column="fakturace" {...sh} className="w-[90px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-mono text-xs w-[120px]">{p.project_id}</TableCell>
                <TableCell className="w-[200px]">
                  <InlineEditableCell value={p.project_name} onSave={(v) => save(p.id, "project_name", v, p.project_name)} className="font-medium" />
                </TableCell>
                <TableCell className="w-[130px]">
                  <InlineEditableCell value={p.klient} onSave={(v) => save(p.id, "klient", v, p.klient || "")} />
                </TableCell>
                <TableCell className="w-[130px]">
                  <InlineEditableCell value={p.pm} onSave={(v) => save(p.id, "pm", v, p.pm || "")} />
                </TableCell>
                <TableCell className="w-[130px]">
                  <InlineEditableCell value={p.konstrukter} onSave={(v) => save(p.id, "konstrukter", v, p.konstrukter || "")} />
                </TableCell>
                <TableCell className="w-[110px]">
                  <InlineEditableCell
                    value={p.status}
                    type="select"
                    options={statusOrder}
                    onSave={(v) => save(p.id, "status", v, p.status || "")}
                    displayValue={p.status ? <StatusBadge status={p.status} /> : "—"}
                  />
                </TableCell>
                <TableCell className="w-[110px]">
                  <InlineEditableCell value={p.datum_smluvni} type="date" onSave={(v) => save(p.id, "datum_smluvni", v, p.datum_smluvni || "")} />
                </TableCell>
                <TableCell className="text-right w-[120px]">
                  <InlineEditableCell
                    value={p.prodejni_cena}
                    type="number"
                    onSave={(v) => save(p.id, "prodejni_cena", v, String(p.prodejni_cena ?? ""))}
                    displayValue={<span className="font-mono text-sm">{formatCurrency(p.prodejni_cena, p.currency || "CZK")}</span>}
                  />
                </TableCell>
                <TableCell className="text-right w-[80px]">
                  <InlineEditableCell value={p.marze} onSave={(v) => save(p.id, "marze", v, p.marze || "")} />
                </TableCell>
                <TableCell className="text-right w-[90px]">
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
            <div><Label>Prodejní cena</Label><Input type="number" value={newProj.prodejni_cena} onChange={(e) => setNewProj(s => ({ ...s, prodejni_cena: e.target.value }))} /></div>
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
