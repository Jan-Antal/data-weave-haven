import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Upload, ChevronDown, Download, FileText, FileSpreadsheet, FileImage, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

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

const DOC_CATEGORIES = [
  { key: "cenova_nabidka", icon: "📄", label: "Cenová nabídka" },
  { key: "smlouva", icon: "📋", label: "Smlouva" },
  { key: "vykresy", icon: "📐", label: "Výkresy" },
  { key: "dokumentace", icon: "📁", label: "Dokumentace" },
  { key: "dodaci_list", icon: "📦", label: "Dodací list" },
];

export function ProjectEditDialog({ project, open, onOpenChange }: ProjectEditDialogProps) {
  const qc = useQueryClient();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { canEdit, canDeleteProject } = useAuth();
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
  const [openCategory, setOpenCategory] = useState<string | null>(null);
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
      setOpenCategory(null);
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
      <DialogContent className="sm:max-w-[920px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Projekt {project.project_id}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[380px]">
          {/* LEFT PANEL — Form fields */}
          <div className="flex-1 px-6 pb-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {/* Col 1 */}
              <div>
                <Label className="text-xs">Project ID</Label>
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
                <Label className="text-xs">Project Name</Label>
                <Input value={form.project_name} onChange={(e) => setForm(s => ({ ...s, project_name: e.target.value }))} />
              </div>

              <div>
                <Label className="text-xs">Klient</Label>
                <Input value={form.klient} onChange={(e) => setForm(s => ({ ...s, klient: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">PM</Label>
                <PeopleSelectDropdown role="PM" value={form.pm} onValueChange={(v) => setForm(s => ({ ...s, pm: v }))} placeholder="Vyberte PM" />
              </div>

              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(s => ({ ...s, status: v }))}>
                  <SelectTrigger><SelectValue placeholder="Vyberte status" /></SelectTrigger>
                  <SelectContent className="z-[99999]">
                    {statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Konstruktér</Label>
                <PeopleSelectDropdown role="Konstruktér" value={form.konstrukter} onValueChange={(v) => setForm(s => ({ ...s, konstrukter: v }))} placeholder="Vyberte konstruktéra" />
              </div>

              <div>
                <Label className="text-xs">Prodejní cena</Label>
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
              <div>
                <Label className="text-xs">Kalkulant</Label>
                <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
              </div>

              <div>
                <Label className="text-xs">Marže</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" className="no-spinners" value={form.marze} onChange={(e) => setForm(s => ({ ...s, marze: e.target.value }))} placeholder="0" />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Datum Smluvní</Label>
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
                      selected={form.datum_smluvni ? parseAppDate(form.datum_smluvni) : undefined}
                      onSelect={(d) => {
                        if (d) setForm(s => ({ ...s, datum_smluvni: formatAppDate(d) }));
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Documents */}
          <div className="w-[340px] shrink-0 border-l border-border bg-muted/30 flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-foreground">Dokumenty</h3>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="space-y-1.5">
                {DOC_CATEGORIES.map((cat) => {
                  const isOpen = openCategory === cat.key;
                  return (
                    <div key={cat.key}>
                      <button
                        type="button"
                        onClick={() => setOpenCategory(isOpen ? null : cat.key)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
                          isOpen
                            ? "border-[hsl(var(--primary))] bg-primary/5 text-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        )}
                      >
                        <span className="text-base leading-none">{cat.icon}</span>
                        <span className="flex-1 text-left text-xs">{cat.label}</span>
                        <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">0</Badge>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="mt-1.5 ml-1 pl-3 border-l-2 border-primary/20 space-y-2">
                          {/* Empty file list */}
                          <p className="text-xs text-muted-foreground py-2">Žádné soubory</p>

                          {/* Upload zone */}
                          <div className="rounded-md border border-dashed border-muted-foreground/30 bg-background flex flex-col items-center justify-center py-3 px-2 cursor-pointer hover:border-muted-foreground/50 transition-colors">
                            <Upload className="h-4 w-4 text-muted-foreground mb-1" />
                            <p className="text-[10px] text-muted-foreground text-center">
                              Přetáhněte soubor nebo vyberte
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {canDeleteProject && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="text-sm text-destructive hover:underline"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Smazat projekt
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-destructive">Opravdu smazat?</span>
                    <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setConfirmDelete(false)}>Zrušit</button>
                    <button type="button" className="text-sm text-destructive font-medium hover:underline" onClick={handleDelete}>Potvrdit</button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Zavřít</Button>
            {canEdit && <Button onClick={handleSave} disabled={idExists || !form.project_id}>Uložit</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
