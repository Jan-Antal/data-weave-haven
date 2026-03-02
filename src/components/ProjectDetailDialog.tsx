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
import { CalendarIcon, Upload, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, FileText, X, Trash2, RefreshCw, MapPin, List, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { marzeStorageToInput, marzeInputToStorage, formatMarze } from "@/lib/currency";
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
import { ConfirmDialog } from "./ConfirmDialog";
import { Textarea } from "@/components/ui/textarea";

interface Project {
  id: string;
  project_id: string;
  project_name: string;
  klient: string | null;
  location: string | null;
  pm: string | null;
  konstrukter: string | null;
  kalkulant: string | null;
  architekt: string | null;
  status: string | null;
  datum_smluvni: string | null;
  datum_objednavky: string | null;
  prodejni_cena: number | null;
  currency: string | null;
  marze: string | null;
  risk: string | null;
  zamereni: string | null;
  tpv_date: string | null;
  expedice: string | null;
  montaz: string | null;
  predani: string | null;
  pm_poznamka: string | null;
  narocnost: string | null;
  hodiny_tpv: string | null;
  percent_tpv: number | null;
  tpv_poznamka: string | null;
}

interface ProjectDetailDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTPVList?: (projectId: string, projectName: string) => void;
  tpvItemCount?: number;
}

const DOC_CATEGORIES = [
  { key: "cenova_nabidka", icon: "📄", label: "Cenová nabídka" },
  { key: "smlouva", icon: "📋", label: "Smlouva" },
  { key: "zadani", icon: "📝", label: "Zadání" },
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

const RISK_OPTIONS = ["Low", "Medium", "High"];

// ── Section header with line-through styling ───────────────────
function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="relative flex items-center mt-5 mb-3">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
        <span className="text-[18px] leading-none">{icon}</span> {label}
      </span>
    </div>
  );
}

// ── Helper: Date picker field ──────────────────────────────────
function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  if (disabled) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Button variant="outline" disabled className="w-full justify-start text-left font-normal bg-muted text-muted-foreground cursor-not-allowed opacity-70">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value || "—"}
        </Button>
      </div>
    );
  }
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value || "Vyberte datum"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[99999]" align="start">
          <Calendar
            mode="single"
            defaultMonth={value ? parseAppDate(value) : undefined}
            selected={value ? parseAppDate(value) : undefined}
            onSelect={(d) => { if (d) onChange(formatAppDate(d)); }}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Compact milestone date field ───────────────────────────────
function CompactDateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  if (disabled) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Button variant="outline" disabled className="w-full justify-start text-left font-normal text-xs h-8 bg-muted text-muted-foreground cursor-not-allowed opacity-70">
          <CalendarIcon className="mr-1 h-3 w-3" />
          {value || "—"}
        </Button>
      </div>
    );
  }
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-8", !value && "text-muted-foreground")}>
            <CalendarIcon className="mr-1 h-3 w-3" />
            {value || "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[99999]" align="start">
          <Calendar
            mode="single"
            defaultMonth={value ? parseAppDate(value) : undefined}
            selected={value ? parseAppDate(value) : undefined}
            onSelect={(d) => { if (d) onChange(formatAppDate(d)); }}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
// ── Form state shape ──────────────────────────────────────────
function buildFormState(p: Project | null) {
  if (!p) return defaultForm();
  return {
    project_id: p.project_id || "",
    project_name: p.project_name || "",
    klient: p.klient || "",
    location: (p as any).location || "",
    pm: p.pm || "",
    konstrukter: p.konstrukter || "",
    kalkulant: p.kalkulant || "",
    architekt: p.architekt || "",
    status: p.status || "",
    datum_smluvni: p.datum_smluvni || "",
    datum_objednavky: (p as any).datum_objednavky || "",
    prodejni_cena: p.prodejni_cena != null ? String(p.prodejni_cena) : "",
    currency: p.currency || "CZK",
    marze: marzeStorageToInput(p.marze),
    risk: p.risk || "",
    zamereni: p.zamereni || "",
    tpv_date: p.tpv_date || "",
    expedice: p.expedice || "",
    montaz: p.montaz || "",
    predani: p.predani || "",
    pm_poznamka: p.pm_poznamka || "",
    narocnost: p.narocnost || "",
    hodiny_tpv: p.hodiny_tpv || "",
    percent_tpv: p.percent_tpv != null ? String(p.percent_tpv) : "",
    tpv_poznamka: p.tpv_poznamka || "",
  };
}

function defaultForm() {
  return {
    project_id: "", project_name: "", klient: "", location: "", pm: "", konstrukter: "", kalkulant: "", architekt: "",
    status: "", datum_smluvni: "", datum_objednavky: "", prodejni_cena: "", currency: "CZK", marze: "",
    risk: "", zamereni: "", tpv_date: "", expedice: "", montaz: "", predani: "", pm_poznamka: "",
    narocnost: "", hodiny_tpv: "", percent_tpv: "", tpv_poznamka: "",
  };
}

export function ProjectDetailDialog({ project, open, onOpenChange, onOpenTPVList, tpvItemCount }: ProjectDetailDialogProps) {
  const qc = useQueryClient();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { canEdit, canDeleteProject, isViewer, isKonstrukter, isPM, isFieldReadOnly, canUploadDocuments } = useAuth();
  const statusLabels = statusOptions.map((s) => s.label);
  const [form, setForm] = useState(defaultForm());
  const [initialForm, setInitialForm] = useState(defaultForm());

  const [priceEditing, setPriceEditing] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);

  const [locSuggestions, setLocSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck(project?.id);

  const sp = useSharePointDocs(project?.project_id ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ file: SPFile; categoryKey: string; loading: boolean; previewUrl: string | null; webUrl: string | null; downloadUrl: string | null } | null>(null);

  // ── Dirty check ─────────────────────────────────────────────
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  const tryClose = useCallback(() => {
    if (isDirty) {
      setUnsavedConfirmOpen(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  // ── Role-based section read-only ────────────────────────────
  // PM: can edit Základní, Finance, PM section. TPV read-only.
  // Konstruktér: can edit TPV section only.
  // Viewer: all read-only.
  const isSectionReadOnly = useCallback((section: "basic" | "finance" | "pm" | "tpv") => {
    if (isViewer) return true;
    if (isKonstrukter) return section !== "tpv";
    if (isPM) return section === "tpv";
    return false;
  }, [isViewer, isKonstrukter, isPM]);

  useEffect(() => {
    if (project && open) {
      const f = buildFormState(project);
      setForm(f);
      setInitialForm(f);
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
    }
  }, [form.location]);

  const handleToggleCategory = useCallback((key: string) => {
    const willOpen = openCategory !== key;
    setOpenCategory(willOpen ? key : null);
    if (willOpen) {
      sp.listFiles(key);
    }
  }, [openCategory, sp]);

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

    const previousValues: Record<string, any> = {
      project_id: project.project_id,
      project_name: project.project_name,
      klient: project.klient,
      location: (project as any).location,
      pm: project.pm,
      konstrukter: project.konstrukter,
      kalkulant: project.kalkulant,
      architekt: project.architekt,
      status: project.status,
      datum_smluvni: project.datum_smluvni,
      datum_objednavky: (project as any).datum_objednavky,
      prodejni_cena: project.prodejni_cena,
      currency: project.currency,
      marze: project.marze,
      risk: project.risk,
      zamereni: project.zamereni,
      tpv_date: project.tpv_date,
      expedice: project.expedice,
      montaz: project.montaz,
      predani: project.predani,
      pm_poznamka: project.pm_poznamka,
      narocnost: project.narocnost,
      hodiny_tpv: project.hodiny_tpv,
      percent_tpv: project.percent_tpv,
      tpv_poznamka: project.tpv_poznamka,
    };

    const newValues = {
      project_id: form.project_id,
      project_name: form.project_name,
      klient: form.klient || null,
      location: form.location || null,
      pm: form.pm || null,
      konstrukter: form.konstrukter || null,
      kalkulant: form.kalkulant || null,
      architekt: form.architekt || null,
      status: form.status || null,
      datum_smluvni: form.datum_smluvni || null,
      datum_objednavky: form.datum_objednavky || null,
      prodejni_cena: form.prodejni_cena ? Number(form.prodejni_cena) : null,
      currency: form.currency || "CZK",
      marze: marzeInputToStorage(form.marze),
      risk: form.risk || null,
      zamereni: form.zamereni || null,
      tpv_date: form.tpv_date || null,
      expedice: form.expedice || null,
      montaz: form.montaz || null,
      predani: form.predani || null,
      pm_poznamka: form.pm_poznamka || null,
      narocnost: form.narocnost || null,
      hodiny_tpv: form.hodiny_tpv || null,
      percent_tpv: form.percent_tpv ? Number(form.percent_tpv) : null,
      tpv_poznamka: form.tpv_poznamka || null,
    };

    const { error } = await supabase.from("projects").update(newValues).eq("id", project.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
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

  // ── Read-only style helper ──────────────────────────────────
  const roClass = "bg-[#f3f4f6] text-muted-foreground cursor-not-allowed opacity-70";

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && previewFile) { setPreviewFile(null); return; }
      if (!v) { tryClose(); return; }
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
              <DialogTitle>{project.project_id} — {project.project_name}</DialogTitle>
            </DialogHeader>

            <div className="flex" style={{ maxHeight: '78vh' }}>
              {/* LEFT PANEL — Form fields */}
              <div className="flex-1 px-6 pb-4 overflow-y-auto">
                {/* ── ZÁKLADNÍ INFORMACE ────────────────────── */}
                <SectionHeader icon="📋" label="ZÁKLADNÍ INFORMACE" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
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
                      disabled={isSectionReadOnly("basic") || isFieldReadOnly("project_id")}
                      className={cn((isSectionReadOnly("basic") || isFieldReadOnly("project_id")) && roClass)}
                    />
                    {idExists && <p className="text-xs text-destructive mt-1">Toto ID již existuje</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Project Name</Label>
                    <Input
                      value={form.project_name}
                      onChange={(e) => setForm(s => ({ ...s, project_name: e.target.value }))}
                      disabled={isSectionReadOnly("basic") || isFieldReadOnly("project_name")}
                      className={cn((isSectionReadOnly("basic") || isFieldReadOnly("project_name")) && roClass)}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Klient</Label>
                    {isSectionReadOnly("basic") ? (
                      <div className="relative flex items-center gap-1">
                        <Input value={form.klient || "—"} disabled className={roClass} />
                        <button type="button" disabled className={cn("h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md border border-input", roClass)}>
                          <MapPin className={cn("h-4 w-4", form.location ? "text-primary" : "text-muted-foreground/30")} />
                        </button>
                      </div>
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
                    <Label className="text-xs">Architekt</Label>
                    {isSectionReadOnly("basic") ? (
                      <Input value={form.architekt || "—"} disabled className={roClass} />
                    ) : (
                      <Input value={form.architekt} onChange={(e) => setForm(s => ({ ...s, architekt: e.target.value }))} placeholder="Architekt" />
                    )}
                  </div>

                  {/* Collapsible location row */}
                  <div className={cn("col-span-2 overflow-hidden transition-all duration-300 ease-in-out", showLocation ? "max-h-[280px] opacity-100" : "max-h-0 opacity-0")}>
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
                              <button key={i} type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors truncate" onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}>
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
                              style={{ height: 'calc(100% + 240px)', marginTop: '-120px' }}
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(form.location)}&z=15&t=m&hl=cs&output=embed`}
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Zadejte adresu</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <DateField label="Datum Objednávky" value={form.datum_objednavky} onChange={(v) => setForm(s => ({ ...s, datum_objednavky: v }))} disabled={isSectionReadOnly("basic") || isFieldReadOnly("datum_objednavky")} />
                  <DateField label="Datum Smluvní" value={form.datum_smluvni} onChange={(v) => setForm(s => ({ ...s, datum_smluvni: v }))} disabled={isSectionReadOnly("basic") || isFieldReadOnly("datum_smluvni")} />
                </div>

                {/* ── FINANCE ──────────────────────────────── */}
                <SectionHeader icon="💰" label="FINANCE" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <Label className="text-xs">Prodejní cena</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type={!isSectionReadOnly("finance") && priceEditing ? "number" : "text"}
                        className={cn("no-spinners", (isSectionReadOnly("finance") || isFieldReadOnly("prodejni_cena")) && roClass)}
                        value={isSectionReadOnly("finance")
                          ? (form.prodejni_cena ? Number(form.prodejni_cena).toLocaleString("cs-CZ") : "—")
                          : (priceEditing ? form.prodejni_cena : (form.prodejni_cena ? Number(form.prodejni_cena).toLocaleString("cs-CZ") : ""))
                        }
                        onChange={(e) => setForm(s => ({ ...s, prodejni_cena: e.target.value }))}
                        onFocus={() => setPriceEditing(true)}
                        onBlur={() => setPriceEditing(false)}
                        disabled={isSectionReadOnly("finance") || isFieldReadOnly("prodejni_cena")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("h-10 px-3 font-mono shrink-0", isSectionReadOnly("finance") && "opacity-70 cursor-not-allowed")}
                        onClick={() => setForm(s => ({ ...s, currency: s.currency === "CZK" ? "EUR" : "CZK" }))}
                        disabled={isSectionReadOnly("finance") || isFieldReadOnly("prodejni_cena")}
                      >
                        {form.currency}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Marže</Label>
                    <div className="relative">
                      <Input
                        type={isSectionReadOnly("finance") ? "text" : "number"}
                        className={cn("no-spinners pr-8", (isSectionReadOnly("finance") || isFieldReadOnly("marze")) && roClass)}
                        value={isSectionReadOnly("finance") ? (form.marze ? `${form.marze}` : "—") : form.marze}
                        onChange={(e) => setForm(s => ({ ...s, marze: e.target.value }))}
                        placeholder="0"
                        disabled={isSectionReadOnly("finance") || isFieldReadOnly("marze")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Kalkulant</Label>
                    {isSectionReadOnly("finance") ? (
                      <Input value={form.kalkulant || "—"} disabled className={roClass} />
                    ) : (
                      <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
                    )}
                  </div>

                  {/* Rozpad ceny placeholder */}
                  <div className="rounded-md border border-dashed border-muted-foreground/30 px-4 py-3 opacity-50 flex items-center">
                    <p className="text-xs italic text-muted-foreground">Rozpad ceny — v přípravě</p>
                  </div>
                </div>

                {/* ── PM — ŘÍZENÍ PROJEKTU ─────────────────── */}
                <SectionHeader icon="📊" label="PM — ŘÍZENÍ PROJEKTU" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <Label className="text-xs">PM</Label>
                    {isSectionReadOnly("pm") || isFieldReadOnly("pm") ? (
                      <Input value={form.pm || "—"} disabled className={roClass} />
                    ) : (
                      <PeopleSelectDropdown role="PM" value={form.pm} onValueChange={(v) => setForm(s => ({ ...s, pm: v }))} placeholder="Vyberte PM" />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    {isSectionReadOnly("pm") ? (
                      <Select value={form.status} disabled>
                        <SelectTrigger className={roClass}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Select value={form.status} onValueChange={(v) => setForm(s => ({ ...s, status: v }))}>
                        <SelectTrigger><SelectValue placeholder="Vyberte status" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{statusLabels.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Risk</Label>
                    {isSectionReadOnly("pm") || isFieldReadOnly("risk") ? (
                      <Select value={form.risk} disabled>
                        <SelectTrigger className={roClass}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{RISK_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Select value={form.risk} onValueChange={(v) => setForm(s => ({ ...s, risk: v }))}>
                        <SelectTrigger><SelectValue placeholder="Vyberte risk" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{RISK_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>{/* empty cell */}</div>

                  {/* Sub-section: Milníky */}
                  <div className="col-span-2 mt-1">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Milníky</span>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      <CompactDateField label="Zaměření" value={form.zamereni} onChange={(v) => setForm(s => ({ ...s, zamereni: v }))} disabled={isSectionReadOnly("pm")} />
                      <CompactDateField label="TPV" value={form.tpv_date} onChange={(v) => setForm(s => ({ ...s, tpv_date: v }))} disabled={isSectionReadOnly("pm")} />
                      <CompactDateField label="Expedice" value={form.expedice} onChange={(v) => setForm(s => ({ ...s, expedice: v }))} disabled={isSectionReadOnly("pm")} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      <CompactDateField label="Montáž" value={form.montaz} onChange={(v) => setForm(s => ({ ...s, montaz: v }))} disabled={isSectionReadOnly("pm")} />
                      <CompactDateField label="Předání" value={form.predani} onChange={(v) => setForm(s => ({ ...s, predani: v }))} disabled={isSectionReadOnly("pm")} />
                      <div>{/* empty cell for alignment */}</div>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <Label className="text-xs">Poznámka PM</Label>
                    <Textarea
                      value={form.pm_poznamka}
                      onChange={(e) => setForm(s => ({ ...s, pm_poznamka: e.target.value }))}
                      disabled={isSectionReadOnly("pm")}
                      className={cn("min-h-[50px] text-sm", isSectionReadOnly("pm") && roClass)}
                      placeholder="Poznámka…"
                    />
                  </div>
                </div>

                {/* ── TPV — TECHNICKÁ PŘÍPRAVA ─────────────── */}
                <SectionHeader icon="🔧" label="TPV — TECHNICKÁ PŘÍPRAVA" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pb-2">
                  <div>
                    <Label className="text-xs">Konstruktér</Label>
                    {isSectionReadOnly("tpv") ? (
                      <Input value={form.konstrukter || "—"} disabled className={roClass} />
                    ) : (
                      <PeopleSelectDropdown role="Konstruktér" value={form.konstrukter} onValueChange={(v) => setForm(s => ({ ...s, konstrukter: v }))} placeholder="Vyberte konstruktéra" />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Náročnost</Label>
                    {isSectionReadOnly("tpv") ? (
                      <Select value={form.narocnost} disabled>
                        <SelectTrigger className={roClass}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{["Low", "Medium", "High"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Select value={form.narocnost} onValueChange={(v) => setForm(s => ({ ...s, narocnost: v }))}>
                        <SelectTrigger><SelectValue placeholder="Vyberte náročnost" /></SelectTrigger>
                        <SelectContent className="z-[99999]">{["Low", "Medium", "High"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Hodiny TPV</Label>
                    <Input
                      value={form.hodiny_tpv}
                      onChange={(e) => setForm(s => ({ ...s, hodiny_tpv: e.target.value }))}
                      disabled={isSectionReadOnly("tpv")}
                      className={cn(isSectionReadOnly("tpv") && roClass)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">% Rozpracovanost</Label>
                    <div className="relative">
                      <Input
                        type={isSectionReadOnly("tpv") ? "text" : "number"}
                        className={cn("no-spinners pr-8", isSectionReadOnly("tpv") && roClass)}
                        value={isSectionReadOnly("tpv") ? (form.percent_tpv ? `${form.percent_tpv}` : "—") : form.percent_tpv}
                        onChange={(e) => setForm(s => ({ ...s, percent_tpv: e.target.value }))}
                        placeholder="0"
                        disabled={isSectionReadOnly("tpv")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Poznámka TPV</Label>
                    <Textarea
                      value={form.tpv_poznamka}
                      onChange={(e) => setForm(s => ({ ...s, tpv_poznamka: e.target.value }))}
                      disabled={isSectionReadOnly("tpv")}
                      className={cn("min-h-[50px] text-sm", isSectionReadOnly("tpv") && roClass)}
                      placeholder="Poznámka…"
                    />
                  </div>

                  {/* TPV Items shortcut row */}
                  <div className="col-span-2 flex items-center gap-2 mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        if (onOpenTPVList && project) {
                          onOpenChange(false);
                          onOpenTPVList(project.project_id, project.project_name);
                        }
                      }}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Import z Excelu
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        if (onOpenTPVList && project) {
                          onOpenChange(false);
                          onOpenTPVList(project.project_id, project.project_name);
                        }
                      }}
                    >
                      <List className="h-3.5 w-3.5" />
                      TPV položky
                      <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                        {tpvItemCount ?? 0}
                      </Badge>
                    </Button>
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL — Documents */}
              <div className="w-[340px] shrink-0 border-l border-border bg-muted/30 flex flex-col">
                <div className="px-4 pt-4 pb-2">
                  <div className="relative flex items-center">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-border" />
                    </div>
                    <span className="relative bg-muted/30 pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
                      <span className="text-[18px] leading-none">📎</span> DOKUMENTY
                    </span>
                    <div className="ml-auto relative flex items-center gap-1.5 pl-2 bg-muted/30">
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
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-1.5">
                    {DOC_CATEGORIES.map((cat) => {
                      const isOpen = openCategory === cat.key;
                      const files = sp.filesByCategory[cat.key] ?? [];

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
                                          <span className="text-muted-foreground">Smazat soubor?</span>
                                          <button type="button" className="text-destructive font-medium hover:underline" onClick={() => setDeletingFile(null)}>Zrušit</button>
                                          <button type="button" className="text-muted-foreground font-medium hover:underline" onClick={() => handleDeleteFile(cat.key, f.name)}>Smazat</button>
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
                                            className="hidden group-hover:block shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
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
                      <Button
                        variant="outline"
                        onClick={() => setDeleteStep(1)}
                      >
                        Smazat projekt
                      </Button>
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
                <Button variant="outline" onClick={tryClose}>Zavřít</Button>
                {canEdit && <Button onClick={handleSave} disabled={idExists || !form.project_id}>Uložit</Button>}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* Unsaved changes confirmation */}
    <ConfirmDialog
      open={unsavedConfirmOpen}
      onConfirm={() => {
        setUnsavedConfirmOpen(false);
        onOpenChange(false);
      }}
      onCancel={() => setUnsavedConfirmOpen(false)}
      description="Máte neuložené změny. Opravdu chcete zavřít?"
    />
    </>
  );
}
