import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Upload, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useSharePointDocs, type SPFile } from "@/hooks/useSharePointDocs";
import { dispatchDocCountUpdate } from "@/hooks/useDocumentCounts";

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

function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "text-red-500";
  if (["xlsx", "xls", "csv"].includes(ext)) return "text-green-600";
  if (["docx", "doc"].includes(ext)) return "text-blue-500";
  if (["dwg", "dxf"].includes(ext)) return "text-orange-500";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "text-purple-500";
  return "text-muted-foreground";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); // 0=button, 1=confirm, 2=doc warning
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck(project?.id);

  const sp = useSharePointDocs(project?.project_id ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ file: SPFile; categoryKey: string; loading: boolean; previewUrl: string | null; webUrl: string | null; downloadUrl: string | null } | null>(null);

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
      setDeleteStep(0);
      setOpenCategory(null);
      sp.resetCache();
      resetIdCheck();
    }
  }, [project, open, resetIdCheck]);

  // Fetch all category counts on dialog open
  useEffect(() => {
    if (project && open) {
      sp.fetchAllCategories();
    }
  }, [project?.project_id, open]);

  const handleToggleCategory = useCallback((key: string) => {
    const willOpen = openCategory !== key;
    setOpenCategory(willOpen ? key : null);
    if (willOpen) {
      sp.listFiles(key);
    }
  }, [openCategory, sp]);

  const handleFileDrop = useCallback(async (e: React.DragEvent, categoryKey: string) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        await sp.uploadFile(categoryKey, file);
        dispatchDocCountUpdate(project!.project_id, 1);
        toast({ title: "Soubor nahrán", description: file.name });
      } catch (err: any) {
        toast({ title: "Chyba uploadu", description: err.message, variant: "destructive" });
      }
    }
  }, [sp]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      try {
        await sp.uploadFile(categoryKey, file);
        dispatchDocCountUpdate(project!.project_id, 1);
        toast({ title: "Soubor nahrán", description: file.name });
      } catch (err: any) {
        toast({ title: "Chyba uploadu", description: err.message, variant: "destructive" });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [sp]);

  const handleDownload = useCallback(async (categoryKey: string, fileName: string) => {
    try {
      const url = await sp.getDownloadUrl(categoryKey, fileName);
      if (url) window.open(url, "_blank");
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
  }, [sp]);

  const handlePreview = useCallback(async (file: SPFile, categoryKey: string) => {
    setPreviewFile({ file, categoryKey, loading: true, previewUrl: null, webUrl: file.webUrl, downloadUrl: file.downloadUrl });
    try {
      const preview = await sp.getPreview(file.itemId);
      setPreviewFile((prev) => prev ? { ...prev, loading: false, previewUrl: preview.previewUrl, webUrl: preview.webUrl ?? file.webUrl, downloadUrl: preview.downloadUrl ?? file.downloadUrl } : null);
    } catch (err: any) {
      console.error("Preview error:", err);
      setPreviewFile((prev) => prev ? { ...prev, loading: false } : null);
    }
  }, [sp]);

  const handlePreviewNavigate = useCallback((direction: -1 | 1) => {
    if (!previewFile) return;
    const files = sp.filesByCategory[previewFile.categoryKey] ?? [];
    const currentIdx = files.findIndex((f) => f.itemId === previewFile.file.itemId);
    const nextIdx = currentIdx + direction;
    if (nextIdx >= 0 && nextIdx < files.length) {
      handlePreview(files[nextIdx], previewFile.categoryKey);
    }
  }, [previewFile, sp.filesByCategory, handlePreview]);

  const previewFiles = previewFile ? (sp.filesByCategory[previewFile.categoryKey] ?? []) : [];
  const previewCurrentIndex = previewFile ? previewFiles.findIndex((f) => f.itemId === previewFile.file.itemId) : 0;
  const previewTotal = previewFiles.length;
  const canGoPrev = previewTotal > 1 && previewCurrentIndex > 0;
  const canGoNext = previewTotal > 1 && previewCurrentIndex < previewTotal - 1;

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
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && previewFile) { setPreviewFile(null); return; }
      if (!v) { onOpenChange(false); }
    }}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden",
          previewFile ? "sm:max-w-[92vw] h-[88vh]" : "sm:max-w-[920px]"
        )}
        onEscapeKeyDown={(e) => {
          if (previewFile) {
            e.preventDefault();
            setPreviewFile(null);
          }
        }}
      >
        {previewFile ? (
          /* ===== PREVIEW MODE ===== */
          <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreviewFile(null)}>
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Zpět
                </Button>
                <FileText className={cn("h-4 w-4 shrink-0", getFileIconColor(previewFile.file.name))} />
                <span className="text-sm font-medium truncate" title={previewFile.file.name}>
                  {previewFile.file.name}
                </span>
                {previewFile.file.size > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(previewFile.file.size)}
                  </span>
                )}
                {previewTotal > 1 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({previewCurrentIndex + 1}/{previewTotal})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canGoPrev && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePreviewNavigate(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {canGoNext && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePreviewNavigate(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Preview body */}
            <div className="flex-1 relative min-h-0">
              {previewFile.loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Načítání náhledu…</p>
                </div>
              )}
              {!previewFile.loading && previewFile.previewUrl ? (
                <iframe
                  src={previewFile.previewUrl}
                  className="w-full h-full border-0"
                  title={`Preview: ${previewFile.file.name}`}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : !previewFile.loading && !previewFile.previewUrl ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <FileText className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Náhled není dostupný pro tento typ souboru.</p>
                </div>
              ) : null}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <span className="text-xs text-muted-foreground truncate">{previewFile.file.name}</span>
                {previewFile.file.size > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(previewFile.file.size)})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-2 text-xs text-gray-700 hover:bg-[#EA592A] hover:text-white hover:border-[#EA592A] transition-colors"
                  onClick={async () => {
                    toast({ title: "Stahování...", description: "Připravujeme soubor ke stažení." });
                    try {
                      let url = previewFile.downloadUrl;
                      if (!url) {
                        url = await sp.getDownloadUrl(previewFile.categoryKey, previewFile.file.name);
                      }
                      if (!url) throw new Error("Nepodařilo se získat odkaz ke stažení.");
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = previewFile.file.name;
                      link.target = "_blank";
                      document.body.appendChild(link);
                      try { link.click(); } catch { window.open(url, "_blank"); }
                      document.body.removeChild(link);
                    } catch (err: any) {
                      toast({ title: "Chyba stahování", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Stáhnout
                </button>
                {previewFile.webUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-2 text-xs text-gray-700 hover:bg-[#EA592A] hover:text-white hover:border-[#EA592A] transition-colors"
                    onClick={() => window.open(previewFile.webUrl!, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Otevřít v SharePointu
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ===== EDIT FORM MODE ===== */
          <>
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Projekt {project.project_id}</DialogTitle>
            </DialogHeader>

            <div className="flex min-h-[380px]">
              {/* LEFT PANEL — Form fields */}
              <div className="flex-1 px-6 pb-4">
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
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
                      const files = sp.filesByCategory[cat.key] ?? [];
                      const isLoading = sp.loadingCategory === cat.key;

                      return (
                        <div key={cat.key}>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(cat.key)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
                              isOpen
                                ? "border-[hsl(var(--primary))] bg-primary/5 text-foreground"
                                : "border-border bg-background text-foreground hover:bg-accent"
                            )}
                          >
                            <span className="text-base leading-none">{cat.icon}</span>
                            <span className="flex-1 text-left text-xs">{cat.label}</span>
                            <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                              {files.length}
                            </Badge>
                            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                          </button>

                          {isOpen && (
                            <div className="mt-1.5 ml-1 pl-3 border-l-2 border-primary/20 space-y-2">
                              {isLoading ? (
                                <div className="flex items-center justify-center py-3">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              ) : files.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">Žádné soubory</p>
                              ) : (
                                <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
                                  {files.map((f) => (
                                    <div key={f.name} className="flex items-center gap-1 py-1 px-1 rounded hover:bg-accent/50 text-xs cursor-pointer" onClick={() => handlePreview(f, cat.key)}>
                                      <FileText className={cn("h-3.5 w-3.5 shrink-0", getFileIconColor(f.name))} />
                                      <span className="truncate flex-1 text-left text-foreground" title={f.name}>
                                        {f.name}
                                      </span>
                                      <span className="text-muted-foreground shrink-0 text-[10px]">{formatFileSize(f.size)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Upload zone */}
                              <div
                                className={cn(
                                  "relative rounded-md border border-dashed border-muted-foreground/30 bg-background flex flex-col items-center justify-center py-3 px-2 cursor-pointer hover:border-muted-foreground/50 transition-colors",
                                  sp.uploading && "pointer-events-none opacity-60"
                                )}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleFileDrop(e, cat.key)}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {sp.uploading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4 text-muted-foreground mb-1" />
                                    <p className="text-[10px] text-muted-foreground text-center">
                                      Přetáhněte soubor nebo vyberte
                                    </p>
                                  </>
                                )}
                              </div>
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                multiple
                                onChange={(e) => handleFileSelect(e, cat.key)}
                              />
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
                    {deleteStep === 0 && (
                      <button
                        type="button"
                        className="rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 transition-colors"
                        onClick={() => setDeleteStep(1)}
                      >
                        Smazat projekt
                      </button>
                    )}
                    {deleteStep === 1 && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">Opravdu smazat?</span>
                        <button type="button" className="text-sm text-red-500 font-medium hover:underline" onClick={() => setDeleteStep(0)}>Zrušit</button>
                        <button type="button" className="text-sm text-gray-400 font-medium hover:underline" onClick={() => {
                          const totalDocs = Object.values(sp.filesByCategory).reduce((sum, files) => sum + files.length, 0);
                          if (totalDocs > 0) {
                            setDeleteStep(2);
                          } else {
                            handleDelete();
                          }
                        }}>Potvrdit</button>
                      </div>
                    )}
                    {deleteStep === 2 && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          Tento projekt obsahuje {Object.values(sp.filesByCategory).reduce((sum, files) => sum + files.length, 0)} dokumentů. Opravdu chcete smazat?
                        </span>
                        <button type="button" className="text-sm text-red-500 font-medium hover:underline" onClick={() => setDeleteStep(0)}>Zrušit</button>
                        <button type="button" className="text-sm text-gray-400 font-medium hover:underline" onClick={handleDelete}>Potvrdit smazání</button>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
