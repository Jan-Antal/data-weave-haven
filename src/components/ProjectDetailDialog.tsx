import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { logActivity } from "@/lib/activityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Upload, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, FileText, X, Trash2, RefreshCw, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { showUndoToast } from "./UndoToast";
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
  location: string | null;
  pm: string | null;
  konstrukter: string | null;
  kalkulant: string | null;
  status: string | null;
  datum_smluvni: string | null;
  datum_objednavky: string | null;
  prodejni_cena: number | null;
  currency: string | null;
  marze: string | null;
}

interface ProjectDetailDialogProps {
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

export function ProjectDetailDialog({ project, open, onOpenChange }: ProjectDetailDialogProps) {
  const qc = useQueryClient();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { canEdit, canDeleteProject, isViewer, isFieldReadOnly, canUploadDocuments } = useAuth();
  const statusLabels = statusOptions.map((s) => s.label);
  const [form, setForm] = useState({
    project_id: "",
    project_name: "",
    klient: "",
    location: "",
    pm: "",
    konstrukter: "",
    kalkulant: "",
    status: "",
    datum_smluvni: "",
    datum_objednavky: "",
    prodejni_cena: "",
    currency: "CZK",
    marze: "",
  });
  
  const [priceEditing, setPriceEditing] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  
  const [locSuggestions, setLocSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null); // "catKey:fileName"
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
        location: (project as any).location || "",
        pm: project.pm || "",
        konstrukter: project.konstrukter || "",
        kalkulant: project.kalkulant || "",
        status: project.status || "",
        datum_smluvni: project.datum_smluvni || "",
        datum_objednavky: (project as any).datum_objednavky || "",
        prodejni_cena: project.prodejni_cena != null ? String(project.prodejni_cena) : "",
        currency: project.currency || "CZK",
        marze: project.marze || "",
      });
      setDeleteStep(0);
      setOpenCategory(null);
      setShowLocation(false);
      setPriceEditing(false);
      
      setLocSuggestions([]);
      setShowLocDropdown(false);
      sp.resetCache();
      resetIdCheck();
    }
  }, [project, open, resetIdCheck]);

  // Google Maps iframe handles its own geocoding via q= parameter — no Nominatim needed for map display

  // Debounced Nominatim autocomplete
  const handleLocationInput = useCallback((value: string) => {
    setForm(s => ({ ...s, location: value }));
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);
    if (value.length < 3) {
      setLocSuggestions([]);
      setShowLocDropdown(false);
      return;
    }
    locDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=5&countrycodes=cz,sk,at,de&addressdetails=1`,
          { headers: { "Accept-Language": "cs" } }
        );
        const data = await res.json();
        setLocSuggestions(data.map((d: any) => ({ display_name: d.display_name, lat: d.lat, lon: d.lon })));
        setShowLocDropdown(data.length > 0);
      } catch {
        setLocSuggestions([]);
        setShowLocDropdown(false);
      }
    }, 500);
  }, []);

  const handleSelectSuggestion = useCallback((s: { display_name: string; lat: string; lon: string }) => {
    setForm(prev => ({ ...prev, location: s.display_name }));
    setShowLocDropdown(false);
    setLocSuggestions([]);
  }, []);

  const handleLocationKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setShowLocDropdown(false);
      // Map updates automatically via iframe q= parameter
    }
  }, [form.location]);

  const handleToggleCategory = useCallback((key: string) => {
    const willOpen = openCategory !== key;
    setOpenCategory(willOpen ? key : null);
    if (willOpen) {
      sp.listFiles(key);
    }
  }, [openCategory, sp]);

  // Fetch all category counts on dialog open
  useEffect(() => {
    if (project && open) {
      sp.fetchAllCategories();
    }
  }, [project?.project_id, open]);

  const handleFileDrop = useCallback(async (e: React.DragEvent, categoryKey: string) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        await sp.uploadFile(categoryKey, file);
        dispatchDocCountUpdate(project!.project_id, 1);
        toast({ title: "Soubor nahrán", description: file.name });
        const catLabel = DOC_CATEGORIES.find(c => c.key === categoryKey)?.label ?? categoryKey;
        logActivity({ projectId: project!.project_id, actionType: "document_uploaded", newValue: file.name, detail: catLabel });
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
        const catLabel = DOC_CATEGORIES.find(c => c.key === categoryKey)?.label ?? categoryKey;
        logActivity({ projectId: project!.project_id, actionType: "document_uploaded", newValue: file.name, detail: catLabel });
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

    // Store previous values for undo
    const previousValues: Record<string, any> = {
      project_id: project.project_id,
      project_name: project.project_name,
      klient: project.klient,
      location: (project as any).location,
      pm: project.pm,
      konstrukter: project.konstrukter,
      kalkulant: project.kalkulant,
      status: project.status,
      datum_smluvni: project.datum_smluvni,
      datum_objednavky: (project as any).datum_objednavky,
      prodejni_cena: project.prodejni_cena,
      currency: project.currency,
      marze: project.marze,
    };

    const newValues = {
      project_id: form.project_id,
      project_name: form.project_name,
      klient: form.klient || null,
      location: form.location || null,
      pm: form.pm || null,
      konstrukter: form.konstrukter || null,
      kalkulant: form.kalkulant || null,
      status: form.status || null,
      datum_smluvni: form.datum_smluvni || null,
      datum_objednavky: form.datum_objednavky || null,
      prodejni_cena: form.prodejni_cena ? Number(form.prodejni_cena) : null,
      currency: form.currency || "CZK",
      marze: form.marze || null,
    };

    const { error } = await supabase.from("projects").update(newValues).eq("id", project.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      // Log status and konstrukter changes
      if (newValues.status !== previousValues.status) {
        logActivity({ projectId: project.project_id, actionType: "status_change", oldValue: previousValues.status || "—", newValue: newValues.status || "—" });
      }
      if (newValues.konstrukter !== previousValues.konstrukter) {
        logActivity({ projectId: project.project_id, actionType: "konstrukter_change", oldValue: previousValues.konstrukter || "—", newValue: newValues.konstrukter || "—" });
      }
      if (newValues.datum_smluvni !== previousValues.datum_smluvni) {
        const fmtOld = previousValues.datum_smluvni ? (parseAppDate(previousValues.datum_smluvni) ? formatAppDate(parseAppDate(previousValues.datum_smluvni)!) : previousValues.datum_smluvni) : "—";
        const fmtNew = newValues.datum_smluvni ? (parseAppDate(newValues.datum_smluvni) ? formatAppDate(parseAppDate(newValues.datum_smluvni)!) : newValues.datum_smluvni) : "—";
        logActivity({ projectId: project.project_id, actionType: "datum_smluvni_change", oldValue: fmtOld, newValue: fmtNew });
      }
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      showUndoToast(project.id, previousValues, qc);
    }
  };

  const handleDelete = async () => {
    // Archive documents first (best-effort)
    try {
      await sp.archiveProject();
    } catch (err: any) {
      console.error("Archive failed (proceeding with delete):", err);
    }
    const { error } = await supabase.from("projects").update({ deleted_at: new Date().toISOString() } as any).eq("id", project.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Projekt přesunut do koše" });
      logActivity({ projectId: project.project_id, actionType: "project_deleted", detail: project.project_name });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    }
  };

  const handleDeleteFile = async (categoryKey: string, fileName: string) => {
    try {
      await sp.deleteFile(categoryKey, fileName);
      dispatchDocCountUpdate(project!.project_id, -1);
      toast({ title: "Soubor smazán" });
      const catLabel = DOC_CATEGORIES.find(c => c.key === categoryKey)?.label ?? categoryKey;
      logActivity({ projectId: project!.project_id, actionType: "document_deleted", oldValue: fileName, detail: catLabel });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setDeletingFile(null);
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
                    {isViewer ? (
                      <p className="text-sm py-2">{form.project_id}</p>
                    ) : (
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
                        disabled={isFieldReadOnly("project_id")}
                        className={cn(isFieldReadOnly("project_id") && "bg-muted text-muted-foreground cursor-not-allowed")}
                      />
                    )}
                    {idExists && <p className="text-xs text-destructive mt-1">Toto ID již existuje</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Project Name</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.project_name}</p>
                    ) : (
                      <Input
                        value={form.project_name}
                        onChange={(e) => setForm(s => ({ ...s, project_name: e.target.value }))}
                        disabled={isFieldReadOnly("project_name")}
                        className={cn(isFieldReadOnly("project_name") && "bg-muted text-muted-foreground cursor-not-allowed")}
                      />
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Klient</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.klient || "—"}{form.location ? ` (${form.location})` : ""}</p>
                    ) : (
                      <div className="relative flex items-center gap-1">
                        <Input value={form.klient} onChange={(e) => setForm(s => ({ ...s, klient: e.target.value }))} />
                        <button
                          type="button"
                          onClick={() => setShowLocation(prev => !prev)}
                          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors"
                          title={form.location ? `Lokace: ${form.location}` : "Přidat lokaci"}
                        >
                          <MapPin className={cn("h-4 w-4", form.location ? "text-primary" : "text-muted-foreground/30")} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">PM</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.pm || "—"}</p>
                    ) : isFieldReadOnly("pm") ? (
                      <Input value={form.pm} disabled className="bg-muted text-muted-foreground cursor-not-allowed" />
                    ) : (
                      <PeopleSelectDropdown role="PM" value={form.pm} onValueChange={(v) => setForm(s => ({ ...s, pm: v }))} placeholder="Vyberte PM" />
                    )}
                  </div>

                  {/* Collapsible location row */}
                  <div
                    className={cn(
                      "col-span-2 overflow-hidden transition-all duration-300 ease-in-out",
                      showLocation ? "max-h-[280px] opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <div className="grid grid-cols-2 gap-3 pb-1">
                      <div className="relative">
                        <Label className="text-xs">Lokace</Label>
                        <Input
                          ref={locInputRef}
                          value={form.location}
                          onChange={(e) => handleLocationInput(e.target.value)}
                          onKeyDown={handleLocationKeyDown}
                          onBlur={() => setTimeout(() => setShowLocDropdown(false), 200)}
                          onFocus={() => { if (locSuggestions.length > 0) setShowLocDropdown(true); }}
                          placeholder="Zadejte adresu..."
                          className="mt-1"
                        />
                        {showLocDropdown && locSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                            {locSuggestions.map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors truncate"
                                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                              >
                                {s.display_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <Label className="text-xs opacity-0">Mapa</Label>
                        <div className="mt-1 rounded-lg border border-input bg-muted/50 overflow-hidden relative" style={{ height: '200px' }}>
                          {form.location ? (
                            <iframe
                              title="Map preview"
                              className="w-full border-0 absolute inset-0 pointer-events-none"
                              style={{ height: 'calc(100% + 200px)', marginTop: '-160px' }}
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(form.location)}&z=15&t=m&hl=cs&output=embed`}
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                              Zadejte adresu
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Status</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.status || "—"}</p>
                    ) : (
                      <Select value={form.status} onValueChange={(v) => setForm(s => ({ ...s, status: v }))}>
                        <SelectTrigger><SelectValue placeholder="Vyberte status" /></SelectTrigger>
                        <SelectContent className="z-[99999]">
                          {statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Konstruktér</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.konstrukter || "—"}</p>
                    ) : (
                      <PeopleSelectDropdown role="Konstruktér" value={form.konstrukter} onValueChange={(v) => setForm(s => ({ ...s, konstrukter: v }))} placeholder="Vyberte konstruktéra" />
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Prodejní cena</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.prodejni_cena ? `${Number(form.prodejni_cena).toLocaleString("cs-CZ")} ${form.currency}` : "—"}</p>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          type={priceEditing ? "number" : "text"}
                          className={cn("no-spinners", isFieldReadOnly("prodejni_cena") && "bg-muted text-muted-foreground cursor-not-allowed")}
                          value={priceEditing ? form.prodejni_cena : (form.prodejni_cena ? Number(form.prodejni_cena).toLocaleString("cs-CZ") : "")}
                          onChange={(e) => setForm(s => ({ ...s, prodejni_cena: e.target.value }))}
                          onFocus={() => setPriceEditing(true)}
                          onBlur={() => setPriceEditing(false)}
                          disabled={isFieldReadOnly("prodejni_cena")}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 px-3 font-mono shrink-0"
                          onClick={() => setForm(s => ({ ...s, currency: s.currency === "CZK" ? "EUR" : "CZK" }))}
                          disabled={isFieldReadOnly("prodejni_cena")}
                        >
                          {form.currency}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Kalkulant</Label>
                    {isViewer ? (
                      <p className="text-sm py-2">{form.kalkulant || "—"}</p>
                    ) : (
                      <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
                    )}
                  </div>

                  {/* Bottom row: 3 columns */}
                  <div className="col-span-2 grid grid-cols-3 gap-x-3">
                    <div>
                      <Label className="text-xs">Marže</Label>
                      {isViewer ? (
                        <p className="text-sm py-2">{form.marze ? `${form.marze} %` : "—"}</p>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            className={cn("no-spinners", isFieldReadOnly("marze") && "bg-muted text-muted-foreground cursor-not-allowed")}
                            value={form.marze}
                            onChange={(e) => setForm(s => ({ ...s, marze: e.target.value }))}
                            placeholder="0"
                            disabled={isFieldReadOnly("marze")}
                          />
                          <span className="text-sm text-muted-foreground shrink-0">%</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Datum Objednávky</Label>
                      {isViewer ? (
                        <p className="text-sm py-2">{form.datum_objednavky || "—"}</p>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.datum_objednavky && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {form.datum_objednavky || "Vyberte datum"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                            <Calendar
                              mode="single"
                              defaultMonth={form.datum_objednavky ? parseAppDate(form.datum_objednavky) : undefined}
                              selected={form.datum_objednavky ? parseAppDate(form.datum_objednavky) : undefined}
                              onSelect={(d) => {
                                if (d) setForm(s => ({ ...s, datum_objednavky: formatAppDate(d) }));
                              }}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Datum Smluvní</Label>
                      {isViewer ? (
                        <p className="text-sm py-2">{form.datum_smluvni || "—"}</p>
                      ) : isFieldReadOnly("datum_smluvni") ? (
                        <Input value={form.datum_smluvni} disabled className="bg-muted text-muted-foreground cursor-not-allowed" />
                      ) : (
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
                              defaultMonth={form.datum_smluvni ? parseAppDate(form.datum_smluvni) : undefined}
                              selected={form.datum_smluvni ? parseAppDate(form.datum_smluvni) : undefined}
                              onSelect={(d) => {
                                if (d) setForm(s => ({ ...s, datum_smluvni: formatAppDate(d) }));
                              }}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL — Documents */}
              <div className="w-[340px] shrink-0 border-l border-border bg-muted/30 flex flex-col">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Dokumenty</h3>
                  <div className="flex items-center gap-1.5">
                    {sp.refreshing && (
                      <span className="text-[10px] text-muted-foreground">Aktualizace...</span>
                    )}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Obnovit dokumenty"
                      onClick={() => sp.manualRefresh()}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", sp.refreshing && "animate-spin")} />
                    </button>
                  </div>
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
                              {sp.loadingCategory === cat.key && !files.length ? (
                                <div className="flex items-center justify-center py-3">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              ) : files.length === 0 ? (
                                <div>
                                  <p className="text-xs text-muted-foreground py-2">Žádné soubory</p>
                                  {sp.cacheTimestamp && (
                                    <p className="text-[10px] text-muted-foreground/60">
                                      Poslední aktualizace: {new Date(sp.cacheTimestamp).toLocaleString("cs-CZ")}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
                                  {files.map((f) => {
                                    const fileKey = `${cat.key}:${f.name}`;
                                    const isDeleting = deletingFile === fileKey;
                                    
                                    if (isDeleting) {
                                      return (
                                        <div key={f.name} className="flex items-center gap-2 py-1 px-1 rounded bg-accent/50 text-xs">
                                          <span className="text-gray-600">Smazat soubor?</span>
                                          <button type="button" className="text-red-500 font-medium hover:underline" onClick={() => setDeletingFile(null)}>Zrušit</button>
                                          <button type="button" className="text-gray-400 font-medium hover:underline" onClick={() => handleDeleteFile(cat.key, f.name)}>Smazat</button>
                                        </div>
                                      );
                                    }
                                    
                                    return (
                                      <div key={f.name} className="group flex items-center gap-1 py-1 px-1 rounded hover:bg-accent/50 text-xs cursor-pointer" onClick={() => handlePreview(f, cat.key)}>
                                        <FileText className={cn("h-3.5 w-3.5 shrink-0", getFileIconColor(f.name))} />
                                        <span className="truncate flex-1 text-left text-foreground" title={f.name}>
                                          {f.name}
                                        </span>
                                        <span className="text-muted-foreground shrink-0 text-[10px] group-hover:hidden">{formatFileSize(f.size)}</span>
                                        {canUploadDocuments && (
                                          <button
                                            type="button"
                                            className="hidden group-hover:block shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setDeletingFile(fileKey); }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Upload zone - hidden for viewers */}
                              {canUploadDocuments && (
                                <>
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
                                </>
                              )}
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
