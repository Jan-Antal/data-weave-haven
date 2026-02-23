import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";

interface Project {
  id: string;
  project_id: string;
  project_name: string;
  klient: string | null;
  pm: string | null;
  konstrukter: string | null;
  kalkulant: string | null;
  status: string | null;
  datum_smluvni: string | null;
  prodejni_cena: number | null;
  currency: string | null;
  marze: string | null;
}

interface ProjectEditDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectEditDialog({ project, open, onOpenChange }: ProjectEditDialogProps) {
  const qc = useQueryClient();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const [form, setForm] = useState({
    project_id: "",
    project_name: "",
    klient: "",
    pm: "",
    konstrukter: "",
    kalkulant: "",
    status: "",
    datum_smluvni: "",
    prodejni_cena: "",
    currency: "CZK",
    marze: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck(project?.id);

  useEffect(() => {
    if (project && open) {
      setForm({
        project_id: project.project_id || "",
        project_name: project.project_name || "",
        klient: project.klient || "",
        pm: project.pm || "",
        konstrukter: project.konstrukter || "",
        kalkulant: project.kalkulant || "",
        status: project.status || "",
        datum_smluvni: project.datum_smluvni || "",
        prodejni_cena: project.prodejni_cena != null ? String(project.prodejni_cena) : "",
        currency: project.currency || "CZK",
        marze: project.marze || "",
      });
      setConfirmDelete(false);
      resetIdCheck();
    }
  }, [project, open, resetIdCheck]);

  if (!project) return null;

  const handleSave = async () => {
    if (idExists) return;
    const { error } = await supabase.from("projects").update({
      project_id: form.project_id,
      project_name: form.project_name,
      klient: form.klient || null,
      pm: form.pm || null,
      konstrukter: form.konstrukter || null,
      kalkulant: form.kalkulant || null,
      status: form.status || null,
      datum_smluvni: form.datum_smluvni || null,
      prodejni_cena: form.prodejni_cena ? Number(form.prodejni_cena) : null,
      currency: form.currency || "CZK",
      marze: form.marze || null,
    }).eq("id", project.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Uloženo" });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("projects").update({ deleted_at: new Date().toISOString() } as any).eq("id", project.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Projekt přesunut do koše" });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Projekt {project.project_id}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label>Project ID</Label>
            <Input
              value={form.project_id}
              onChange={(e) => setForm(s => ({ ...s, project_id: e.target.value }))}
              onBlur={() => {
                if (form.project_id !== project.project_id) {
                  checkProjectId(form.project_id);
                } else {
                  resetIdCheck();
                }
              }}
            />
            {idExists && <p className="text-xs text-destructive mt-1">Toto ID již existuje</p>}
          </div>
          <div>
            <Label>Datum Smluvní</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.datum_smluvni && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.datum_smluvni || "Vyberte datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                <Calendar
                  mode="single"
                  selected={form.datum_smluvni ? parse(form.datum_smluvni, "d.M.yyyy", new Date()) : undefined}
                  onSelect={(d) => {
                    if (d) setForm(s => ({ ...s, datum_smluvni: format(d, "d.M.yyyy") }));
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Project Name</Label>
            <Input value={form.project_name} onChange={(e) => setForm(s => ({ ...s, project_name: e.target.value }))} />
          </div>
          <div>
            <Label>PM</Label>
            <PeopleSelectDropdown role="PM" value={form.pm} onValueChange={(v) => setForm(s => ({ ...s, pm: v }))} placeholder="Vyberte PM" />
          </div>

          <div>
            <Label>Klient</Label>
            <Input value={form.klient} onChange={(e) => setForm(s => ({ ...s, klient: e.target.value }))} />
          </div>
          <div>
            <Label>Konstruktér</Label>
            <PeopleSelectDropdown role="Konstruktér" value={form.konstrukter} onValueChange={(v) => setForm(s => ({ ...s, konstrukter: v }))} placeholder="Vyberte konstruktéra" />
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(s => ({ ...s, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Vyberte status" /></SelectTrigger>
              <SelectContent className="z-[99999]">
                {statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kalkulant</Label>
            <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
          </div>

          <div className="col-span-2">
            <Label>Prodejní cena</Label>
            <div className="flex items-center gap-1">
              <Input type="number" className="no-spinners" value={form.prodejni_cena} onChange={(e) => setForm(s => ({ ...s, prodejni_cena: e.target.value }))} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 px-3 font-mono shrink-0"
                onClick={() => setForm(s => ({ ...s, currency: s.currency === "CZK" ? "EUR" : "CZK" }))}
              >
                {form.currency}
              </Button>
            </div>
          </div>
          <div className="col-span-2">
            <Label>Marže</Label>
            <div className="flex items-center gap-1">
              <Input type="number" className="no-spinners" value={form.marze} onChange={(e) => setForm(s => ({ ...s, marze: e.target.value }))} placeholder="0" />
              <span className="text-sm text-muted-foreground shrink-0">%</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 mt-1">
          {!confirmDelete ? (
            <Button size="sm" className="bg-[#EA592A] hover:bg-[#EA592A]/90 text-white" onClick={() => setConfirmDelete(true)}>
              Smazat projekt
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#EA592A]">Opravdu chcete smazat tento projekt? Tato akce je nevratná.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
                <Button size="sm" className="bg-[#EA592A] hover:bg-[#EA592A]/90 text-white" onClick={handleDelete}>Potvrdit smazání</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zavřít</Button>
          <Button onClick={handleSave} disabled={idExists || !form.project_id}>Uložit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
