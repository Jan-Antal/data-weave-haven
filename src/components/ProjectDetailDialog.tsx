import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MobileTapField } from "./MobileTapToEdit";
import { useIsMobile } from "@/hooks/use-mobile";
import { logActivity } from "@/lib/activityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Upload, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, FileText, X, Trash2, RefreshCw, MapPin, List, FileSpreadsheet, Camera } from "lucide-react";
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
import { useSharePointDocs, type SPFile, CATEGORY_FOLDER_MAP } from "@/hooks/useSharePointDocs";
import { useChunkedUpload } from "@/hooks/useChunkedUpload";
import { UploadProgressBar } from "./UploadProgressBar";
import { dispatchDocCountUpdate, migrateDocCountCache, setDocCountAbsolute } from "@/hooks/useDocumentCounts";
import { ConfirmDialog } from "./ConfirmDialog";
import { Textarea } from "@/components/ui/textarea";
import { RozpadCeny } from "./RozpadCeny";
import { PhotoLightbox, PhotoTimelineGrid, isImageFile, generatePhotoFilename } from "./PhotoLightbox";
import { useFileSelection } from "@/hooks/useFileSelection";
import { FileSelectionBar, FolderDropTarget, useFileDragVisuals, useDropFlash } from "./DocumentDragDrop";

export interface ProjectDetailProject {
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
  van_date: string | null;
  pm_poznamka: string | null;
  narocnost: string | null;
  hodiny_tpv: string | null;
  percent_tpv: number | null;
  tpv_poznamka: string | null;
  cost_preset_id: string | null;
  cost_material_pct: number | null;
  cost_overhead_pct: number | null;
  cost_doprava_pct: number | null;
  cost_production_pct: number | null;
  cost_subcontractors_pct: number | null;
  cost_montaz_pct: number | null;
  cost_is_custom: boolean | null;
  [key: string]: any;
}

// Keep backward compat alias
type Project = ProjectDetailProject;

interface ProjectDetailDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTPVList?: (projectId: string, projectName: string, autoImport?: boolean) => void;
  tpvItemCount?: number;
  mode?: "dialog" | "embedded";
}

const DOC_CATEGORIES = [
  { key: "cenova_nabidka", icon: "📄", label: "Cenová nabídka" },
  { key: "smlouva", icon: "📋", label: "Smlouva" },
  { key: "zadani", icon: "📝", label: "Zadání" },
  { key: "vykresy", icon: "📐", label: "Výkresy" },
  { key: "dokumentace", icon: "📁", label: "Dokumentace" },
  { key: "dodaci_list", icon: "📦", label: "Předávací protokol" },
  { key: "fotky", icon: "📷", label: "Fotky" },
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
function formatDisplayDate(value: string): string {
  if (!value) return "";
  const d = parseAppDate(value);
  return d ? formatAppDate(d) : value;
}

function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const displayVal = formatDisplayDate(value);
  if (disabled) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Button variant="outline" disabled className="w-full justify-start text-left font-normal bg-muted text-muted-foreground cursor-not-allowed opacity-70">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayVal || "—"}
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
            {displayVal || "Vyberte datum"}
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
  const displayVal = formatDisplayDate(value);
  if (disabled) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Button variant="outline" disabled className="w-full justify-start text-left font-normal text-xs h-8 bg-muted text-muted-foreground cursor-not-allowed opacity-70">
          <CalendarIcon className="mr-1 h-3 w-3" />
          {displayVal || "—"}
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
            {displayVal || "—"}
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
    contact_person: (p as any).contact_person || "",
    contact_email: (p as any).contact_email || "",
    contact_tel: (p as any).contact_tel || "",
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
    van_date: (p as any).van_date || "",
    pm_poznamka: p.pm_poznamka || "",
    narocnost: p.narocnost || "",
    hodiny_tpv: p.hodiny_tpv || "",
    percent_tpv: p.percent_tpv != null ? String(p.percent_tpv) : "",
    tpv_poznamka: p.tpv_poznamka || "",
    cost_preset_id: p.cost_preset_id || null,
    cost_material_pct: p.cost_material_pct ?? null,
    cost_overhead_pct: p.cost_overhead_pct ?? null,
    cost_doprava_pct: p.cost_doprava_pct ?? null,
    cost_production_pct: p.cost_production_pct ?? null,
    cost_subcontractors_pct: p.cost_subcontractors_pct ?? null,
    cost_montaz_pct: p.cost_montaz_pct ?? null,
    cost_is_custom: p.cost_is_custom ?? false,
  };
}

function defaultForm() {
  return {
    project_id: "", project_name: "", klient: "", location: "", contact_person: "", contact_email: "", contact_tel: "",
    pm: "", konstrukter: "", kalkulant: "", architekt: "",
    status: "", datum_smluvni: "", datum_objednavky: "", prodejni_cena: "", currency: "CZK", marze: "",
    risk: "", zamereni: "", tpv_date: "", expedice: "", montaz: "", predani: "", van_date: "", pm_poznamka: "",
    narocnost: "", hodiny_tpv: "", percent_tpv: "", tpv_poznamka: "",
    cost_preset_id: null as string | null,
    cost_material_pct: null as number | null,
    cost_overhead_pct: null as number | null,
    cost_doprava_pct: null as number | null,
    cost_production_pct: null as number | null,
    cost_subcontractors_pct: null as number | null,
    cost_montaz_pct: null as number | null,
    cost_is_custom: false,
  };
}

export function ProjectDetailDialog({ project, open, onOpenChange, onOpenTPVList, tpvItemCount, mode = "dialog" }: ProjectDetailDialogProps) {
  const qc = useQueryClient();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { canEdit, canDeleteProject, isViewer, isKonstrukter, isPM, isFieldReadOnly, canUploadDocuments, isAdmin } = useAuth();
  const statusLabels = statusOptions.map((s) => s.label);
  const [form, setForm] = useState(defaultForm());
  const [initialForm, setInitialForm] = useState(defaultForm());

  const [priceEditing, setPriceEditing] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const [locSuggestions, setLocSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locInputRef = useRef<HTMLInputElement>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck(project?.id);

  const sp = useSharePointDocs(project?.project_id ?? "");
  const chunked = useChunkedUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ file: SPFile; categoryKey: string; loading: boolean; previewUrl: string | null; webUrl: string | null; downloadUrl: string | null } | null>(null);
  const isMobile = useIsMobile();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const activeUploadCatRef = useRef<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{ files: SPFile[]; index: number } | null>(null);
  const [reklamaceToggle, setReklamaceToggle] = useState(false);

  // ── File selection & drag-to-move (desktop only) ────────────
  const fileSelection = useFileSelection();
  const [fileDragActive, setFileDragActive] = useState(false);
  const [fileDragSourceCat, setFileDragSourceCat] = useState<string | null>(null);
  const [movingFiles, setMovingFiles] = useState(false);
  const dragVisuals = useFileDragVisuals();
  const { flashingCategory, flash: flashFolder } = useDropFlash();

  // ── Mobile swipe-down-to-close ──────────────────────────────
  const [mobileDragY, setMobileDragY] = useState(0);
  const mobileDragRef = useRef({ startY: 0, startTime: 0, dragging: false });
  const mobileSheetRef = useRef<HTMLDivElement>(null);

  // ── Mobile: camera photo upload ─────────────────────────────
  const handleCameraUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    try {
      const fileName = generatePhotoFilename(false);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await supabase.functions.invoke('sharepoint-documents', {
        body: { action: 'upload', projectId: project.project_id, category: 'Fotky', fileName, fileContent: base64 },
      });
      toast({ title: 'Foto nahráno ✓' });
      sp.listFiles('fotky', true);
      dispatchDocCountUpdate(project.project_id, 1);
    } catch (err: any) {
      toast({ title: 'Chyba', description: err.message, variant: 'destructive' });
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [project, sp]);

  // ── Dirty check ─────────────────────────────────────────────
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  const tryClose = useCallback(() => {
    if (isDirty) {
      setUnsavedConfirmOpen(true);
    } else {
      requestAnimationFrame(() => onOpenChange(false));
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
    // Clear selection when switching folders
    fileSelection.clearSelection();
    if (willOpen) {
      sp.listFiles(key);
    }
  }, [openCategory, sp, fileSelection]);

  useEffect(() => {
    if (project && open) {
      sp.fetchAllCategories();
    }
  }, [project?.project_id, open]);

  // Sync absolute document count after files are loaded
  useEffect(() => {
    if (project && open && Object.keys(sp.filesByCategory).length > 0) {
      const total = Object.values(sp.filesByCategory).reduce((s, f) => s + f.length, 0);
      setDocCountAbsolute(project.project_id, total);
    }
  }, [project?.project_id, open, sp.filesByCategory]);

  const uploadSingleFile = useCallback(async (categoryKey: string, file: File) => {
    const folder = CATEGORY_FOLDER_MAP[categoryKey];
    if (!folder || !project) return;

    // For fotky category, rename to timestamp-based filename
    let uploadFile = file;
    if (categoryKey === "fotky" && isImageFile(file.name)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const baseName = generatePhotoFilename(reklamaceToggle);
      const newName = baseName.replace(/\.jpg$/, `.${ext}`);
      uploadFile = new File([file], newName, { type: file.type });
    }

    if (chunked.isLargeFile(uploadFile)) {
      try {
        const result = await chunked.uploadLargeFile(project.project_id, folder, uploadFile);
        sp.listFiles(categoryKey, true);
        dispatchDocCountUpdate(project.project_id, 1);
        const catLabel = DOC_CATEGORIES.find(c => c.key === categoryKey)?.label ?? categoryKey;
        logActivity({ projectId: project.project_id, actionType: "document_uploaded", newValue: uploadFile.name, detail: catLabel });
      } catch (err: any) {
        if (err.message === "CANCELLED") return;
        toast({ title: "Chyba nahrávání", description: `Nepodařilo se nahrát ${uploadFile.name}. Zkuste to znovu.`, variant: "destructive" });
      }
    } else {
      try {
        await sp.uploadFile(categoryKey, uploadFile);
        dispatchDocCountUpdate(project.project_id, 1);
        toast({ title: "Soubor nahrán", description: uploadFile.name });
        const catLabel = DOC_CATEGORIES.find(c => c.key === categoryKey)?.label ?? categoryKey;
        logActivity({ projectId: project.project_id, actionType: "document_uploaded", newValue: uploadFile.name, detail: catLabel });
      } catch (err: any) {
        const msg = err.message?.includes("AbortError") || err.message?.includes("timeout")
          ? "Nahrávání trvalo příliš dlouho. Zkuste menší soubor."
          : err.message?.includes("Edge function")
            ? "Spojení se serverem selhalo. Zkuste to znovu."
            : `Nepodařilo se nahrát ${uploadFile.name}. Zkuste to znovu.`;
        toast({ title: "Chyba nahrávání", description: msg, variant: "destructive" });
      }
    }
  }, [sp, chunked, project, reklamaceToggle]);

  const handleFileDrop = useCallback(async (e: React.DragEvent, categoryKey: string) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      uploadSingleFile(categoryKey, file);
    }
  }, [uploadSingleFile]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      uploadSingleFile(categoryKey, file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadSingleFile]);

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

  const handleMobileTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const rect = mobileSheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touchY = e.touches[0].clientY - rect.top;
    if (touchY > 80) return;
    mobileDragRef.current = { startY: e.touches[0].clientY, startTime: Date.now(), dragging: true };
  }, [isMobile]);

  const handleMobileTouchMove = useCallback((e: React.TouchEvent) => {
    if (!mobileDragRef.current.dragging) return;
    const dy = e.touches[0].clientY - mobileDragRef.current.startY;
    setMobileDragY(Math.max(0, dy));
  }, []);

  const handleMobileTouchEnd = useCallback(() => {
    if (!mobileDragRef.current.dragging) return;
    const elapsed = (Date.now() - mobileDragRef.current.startTime) / 1000;
    const velocity = mobileDragY / elapsed;
    if (mobileDragY > 100 || velocity > 500) {
      tryClose();
    }
    setMobileDragY(0);
    mobileDragRef.current.dragging = false;
  }, [mobileDragY, tryClose]);

  useEffect(() => {
    if (!open) setMobileDragY(0);
  }, [open]);

  // moved early return below all hooks

  const handleSave = async () => {
    if (idExists) return;

    const previousValues: Record<string, any> = {
      project_id: project.project_id,
      project_name: project.project_name,
      klient: project.klient,
      location: (project as any).location,
      contact_person: (project as any).contact_person,
      contact_email: (project as any).contact_email,
      contact_tel: (project as any).contact_tel,
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
      van_date: (project as any).van_date,
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
      contact_person: form.contact_person || null,
      contact_email: form.contact_email || null,
      contact_tel: form.contact_tel || null,
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
      van_date: form.van_date || null,
      pm_poznamka: form.pm_poznamka || null,
      narocnost: form.narocnost || null,
      hodiny_tpv: form.hodiny_tpv || null,
      percent_tpv: form.percent_tpv ? Number(form.percent_tpv) : null,
      tpv_poznamka: form.tpv_poznamka || null,
      cost_preset_id: form.cost_preset_id || null,
      cost_material_pct: form.cost_material_pct,
      cost_overhead_pct: form.cost_overhead_pct,
      cost_doprava_pct: form.cost_doprava_pct,
      cost_production_pct: form.cost_production_pct,
      cost_subcontractors_pct: form.cost_subcontractors_pct,
      cost_montaz_pct: form.cost_montaz_pct,
      cost_is_custom: form.cost_is_custom,
    };

    // If project ID changed, try to rename SharePoint folder (never blocks DB save)
    const projectIdChanged = form.project_id !== project.project_id;
    let spRenameFailed = false;
    if (projectIdChanged) {
      try {
        const renameResult = await supabase.functions.invoke("sharepoint-documents", {
          body: { action: "rename", oldProjectId: project.project_id, newProjectId: form.project_id },
        });

        const errorCode = (renameResult.data as any)?.error;
        const errMsg = renameResult.error?.message ?? "";

        // Only block save if target folder already exists on SharePoint
        if (errorCode === "TARGET_EXISTS" || errMsg.includes("TARGET_EXISTS")) {
          toast({ title: "Chyba", description: `Složka s ID "${form.project_id}" již na SharePointu existuje.`, variant: "destructive" });
          setForm((f) => ({ ...f, project_id: project.project_id }));
          return;
        }

        // Any other error — proceed with save, show warning later
        if (renameResult.error) {
          console.warn("SharePoint rename failed (non-blocking):", errMsg);
          spRenameFailed = true;
        }
        // folderNotFound or success: true — all fine, proceed
      } catch (err: any) {
        console.warn("SharePoint rename error (non-blocking):", err);
        spRenameFailed = true;
      }
    }

    const { error } = await supabase.from("projects").update(newValues as any).eq("id", project.id);
    if (error) {
      console.error("Project save error:", error.code, error.message, error.details, error.hint);
      if (error.code === "23505") {
        toast({ title: "Chyba", description: "Projekt s tímto ID již existuje", variant: "destructive" });
      } else {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      }
      return;
    }
    // Log activity using original project_id for reference
    const logPid = form.project_id !== project.project_id ? form.project_id : project.project_id;
    if (newValues.status !== previousValues.status) {
      logActivity({ projectId: logPid, actionType: "status_change", oldValue: previousValues.status || "—", newValue: newValues.status || "—" });
    }
    if (newValues.konstrukter !== previousValues.konstrukter) {
      logActivity({ projectId: logPid, actionType: "konstrukter_change", oldValue: previousValues.konstrukter || "—", newValue: newValues.konstrukter || "—" });
    }
    if (newValues.datum_smluvni !== previousValues.datum_smluvni) {
      const fmtOld = previousValues.datum_smluvni ? (parseAppDate(previousValues.datum_smluvni) ? formatAppDate(parseAppDate(previousValues.datum_smluvni)!) : previousValues.datum_smluvni) : "—";
      const fmtNew = newValues.datum_smluvni ? (parseAppDate(newValues.datum_smluvni) ? formatAppDate(parseAppDate(newValues.datum_smluvni)!) : newValues.datum_smluvni) : "—";
      logActivity({ projectId: logPid, actionType: "datum_smluvni_change", oldValue: fmtOld, newValue: fmtNew });
    }
    if (form.project_id !== project.project_id) {
      logActivity({ projectId: logPid, actionType: "project_id_change", oldValue: project.project_id, newValue: form.project_id });
      // Migrate document count cache to new project ID
      migrateDocCountCache(project.project_id, form.project_id);
      // If SharePoint rename failed, log warning and show toast
      if (spRenameFailed) {
        logActivity({ projectId: logPid, actionType: "project_id_change", detail: "⚠️ SharePoint složka nebyla přejmenována — vyžaduje ruční přejmenování" });
        toast({ title: "ID projektu změněno", description: "⚠ Složka na SharePointu nebyla přejmenována — přejmenujte ručně." });
      }
    }
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project-stages"] });
    qc.invalidateQueries({ queryKey: ["tpv-items"] });
    onOpenChange(false);
    showUndoToast(project.id, previousValues, qc);
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

  // ── Move files between folders ──────────────────────────────
  const handleMoveFiles = useCallback(async (sourceCategoryKey: string, destCategoryKey: string, filesToMove: SPFile[]) => {
    if (!project || filesToMove.length === 0) return;
    setMovingFiles(true);
    const destLabel = DOC_CATEGORIES.find((c) => c.key === destCategoryKey)?.label ?? destCategoryKey;
    let succeeded = 0;
    let failed = 0;

    // Process in batches of 5
    const batches: SPFile[][] = [];
    for (let i = 0; i < filesToMove.length; i += 5) {
      batches.push(filesToMove.slice(i, i + 5));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((f) => sp.moveFile(sourceCategoryKey, destCategoryKey, f))
      );
      for (const r of results) {
        if (r.status === "fulfilled") succeeded++;
        else failed++;
      }
    }

    fileSelection.clearSelection();
    setFileDragActive(false);
    setFileDragSourceCat(null);
    setMovingFiles(false);

    if (failed === 0) {
      flashFolder(destCategoryKey);
      toast({
        title: `${succeeded} ${succeeded === 1 ? "soubor přesunut" : succeeded < 5 ? "soubory přesunuty" : "souborů přesunuto"} do ${destLabel} ✓`,
      });
    } else {
      toast({
        title: `${succeeded} přesunuto, ${failed} selhalo`,
        description: "Zkuste přesun zopakovat",
        variant: "destructive",
      });
    }

    // Log activity
    logActivity({
      projectId: project.project_id,
      actionType: "document_moved",
      detail: `${succeeded} souborů: ${DOC_CATEGORIES.find((c) => c.key === sourceCategoryKey)?.label} → ${destLabel}`,
    });
  }, [project, sp, fileSelection]);

  const handleFileDragStart = useCallback((e: React.DragEvent, file: SPFile, categoryKey: string) => {
    const files = sp.filesByCategory[categoryKey] ?? [];
    // If dragged file is not selected, select only it
    if (!fileSelection.isSelected(file.itemId)) {
      fileSelection.clearSelection();
      fileSelection.toggleFile(file.itemId, files);
    }
    setFileDragActive(true);
    setFileDragSourceCat(categoryKey);
    // Set drag data
    e.dataTransfer.effectAllowed = "move";
    const selectedFiles = files.filter((f) => fileSelection.isSelected(f.itemId));
    const count = Math.max(selectedFiles.length, 1);
    e.dataTransfer.setData("text/plain", `${count} soubor${count > 1 ? "ů" : ""}`);
    
    // Custom drag ghost
    dragVisuals.attachGhost(e, file.name, count);
  }, [sp.filesByCategory, fileSelection, dragVisuals]);

  const handleFileDragEnd = useCallback(() => {
    setFileDragActive(false);
    setFileDragSourceCat(null);
    dragVisuals.cleanup();
  }, [dragVisuals]);

  const handleFolderDrop = useCallback((destCategoryKey: string) => {
    if (!fileDragSourceCat || fileDragSourceCat === destCategoryKey) return;
    const sourceFiles = sp.filesByCategory[fileDragSourceCat] ?? [];
    const selectedFiles = sourceFiles.filter((f) => fileSelection.isSelected(f.itemId));
    if (selectedFiles.length > 0) {
      handleMoveFiles(fileDragSourceCat, destCategoryKey, selectedFiles);
    }
  }, [fileDragSourceCat, sp.filesByCategory, fileSelection, handleMoveFiles]);

  const handleSelectionBarMove = useCallback((destCategoryKey: string) => {
    if (!openCategory || openCategory === destCategoryKey) return;
    const sourceFiles = sp.filesByCategory[openCategory] ?? [];
    const selectedFiles = sourceFiles.filter((f) => fileSelection.isSelected(f.itemId));
    if (selectedFiles.length > 0) {
      handleMoveFiles(openCategory, destCategoryKey, selectedFiles);
    }
  }, [openCategory, sp.filesByCategory, fileSelection, handleMoveFiles]);

  // ── Read-only styling class ──
  const roClass = "opacity-70 cursor-default bg-muted/50";

  // ── Extracted form fields (shared between dialog and embedded modes) ──
  const formFieldsContent = (
    <>
      {/* ── ZÁKLADNÍ INFORMACE ────────────────────── */}
      <SectionHeader icon="📋" label="ZÁKLADNÍ INFORMACE" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div>
          <Label className="text-xs">Project ID</Label>
          <MobileTapField
            displayValue={form.project_id}
            disabled={isSectionReadOnly("basic") || isFieldReadOnly("project_id")}
          >
            {({ autoFocus }) => (
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
                readOnly={isSectionReadOnly("basic") || isFieldReadOnly("project_id")}
                tabIndex={isSectionReadOnly("basic") || isFieldReadOnly("project_id") ? -1 : undefined}
                style={(isSectionReadOnly("basic") || isFieldReadOnly("project_id")) ? { cursor: "default" } : undefined}
                autoFocus={autoFocus}
              />
            )}
          </MobileTapField>
          {idExists && <p className="text-xs text-destructive mt-1">Toto ID již existuje</p>}
        </div>
        <div>
          <Label className="text-xs">Project Name</Label>
          <MobileTapField
            displayValue={form.project_name}
            disabled={isSectionReadOnly("basic") || isFieldReadOnly("project_name")}
          >
            {({ autoFocus }) => (
              <Input
                value={form.project_name}
                onChange={(e) => setForm(s => ({ ...s, project_name: e.target.value }))}
                disabled={isSectionReadOnly("basic") || isFieldReadOnly("project_name")}
                className={cn((isSectionReadOnly("basic") || isFieldReadOnly("project_name")) && roClass)}
                autoFocus={autoFocus}
              />
            )}
          </MobileTapField>
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
          <MobileTapField displayValue={form.architekt || ""} disabled={isSectionReadOnly("basic")}>
            {({ autoFocus }) => isSectionReadOnly("basic") ? (
              <Input value={form.architekt || "—"} disabled className={roClass} />
            ) : (
              <Input value={form.architekt} onChange={(e) => setForm(s => ({ ...s, architekt: e.target.value }))} placeholder="Architekt" autoFocus={autoFocus} />
            )}
          </MobileTapField>
        </div>

        {/* Collapsible location row */}
        <div className={cn("col-span-2 overflow-hidden transition-all duration-300 ease-in-out", showLocation ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-1">
            {/* ── KONTAKT sub-section ── */}
            <div className="col-span-1 md:col-span-2">
              <div className="relative flex items-center mb-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Kontakt
                </span>
              </div>
            </div>
            <div className="col-span-1 md:col-span-2">
              <Label className="text-xs">Kontaktní osoba</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm(s => ({ ...s, contact_person: e.target.value }))}
                placeholder="Jméno kontaktní osoby"
                disabled={isSectionReadOnly("basic")}
                className={cn("mt-1", isSectionReadOnly("basic") && roClass)}
              />
            </div>
            <div>
              <Label className="text-xs">Kontakt email</Label>
              <Input
                value={form.contact_email}
                onChange={(e) => setForm(s => ({ ...s, contact_email: e.target.value }))}
                placeholder="email@example.com"
                disabled={isSectionReadOnly("basic")}
                className={cn("mt-1", isSectionReadOnly("basic") && roClass)}
              />
            </div>
            <div>
              <Label className="text-xs">Kontakt tel</Label>
              <Input
                value={form.contact_tel}
                onChange={(e) => setForm(s => ({ ...s, contact_tel: e.target.value }))}
                placeholder="+420 777 000 000"
                disabled={isSectionReadOnly("basic")}
                className={cn("mt-1", isSectionReadOnly("basic") && roClass)}
              />
            </div>

            {/* ── LOKACE sub-section ── */}
            <div className="col-span-1 md:col-span-2 mt-2">
              <div className="relative flex items-center mb-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Lokace
                </span>
              </div>
            </div>
            <div className="relative">
              <Label className="text-xs">Adresa</Label>
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
            <div className="flex flex-col md:-mx-0 -mx-4">
              <Label className="text-xs opacity-0 hidden md:block">Mapa</Label>
              <div className="md:mt-1 md:rounded-lg rounded-none border border-input bg-muted/50 overflow-hidden relative" style={{ height: '200px' }}>
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
        <DateField label="Datum Smluvní" value={form.datum_smluvni} onChange={(v) => setForm(s => ({ ...s, datum_smluvni: v }))} disabled={isSectionReadOnly("basic") || isFieldReadOnly("datum_smluvni", project?.datum_smluvni ?? null)} />
      </div>

      {/* ── FINANCE ──────────────────────────────── */}
      <SectionHeader icon="💰" label="FINANCE" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div>
          <Label className="text-xs">Prodejní cena</Label>
          <MobileTapField
            displayValue={form.prodejni_cena ? `${Number(form.prodejni_cena).toLocaleString("cs-CZ")} ${form.currency}` : ""}
            disabled={isSectionReadOnly("finance") || isFieldReadOnly("prodejni_cena")}
          >
            {({ autoFocus }) => (
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
                  autoFocus={autoFocus}
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
            )}
          </MobileTapField>
        </div>
        <div>
          <Label className="text-xs">Marže</Label>
          <MobileTapField
            displayValue={form.marze ? `${form.marze} %` : ""}
            disabled={isSectionReadOnly("finance") || isFieldReadOnly("marze")}
          >
            {({ autoFocus }) => (
              <div className="relative">
                <Input
                  type={isSectionReadOnly("finance") ? "text" : "number"}
                  className={cn("no-spinners pr-8", (isSectionReadOnly("finance") || isFieldReadOnly("marze")) && roClass)}
                  value={isSectionReadOnly("finance") ? (form.marze ? `${form.marze}` : "—") : form.marze}
                  onChange={(e) => setForm(s => ({ ...s, marze: e.target.value }))}
                  placeholder="0"
                  disabled={isSectionReadOnly("finance") || isFieldReadOnly("marze")}
                  autoFocus={autoFocus}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
              </div>
            )}
          </MobileTapField>
        </div>

        {/* Rozpad ceny — admin only */}
        {isAdmin && (
          <RozpadCeny
            projectId={project.project_id}
            prodejniCena={form.prodejni_cena ? Number(form.prodejni_cena) : null}
            marze={form.marze ? parseFloat(String(form.marze).replace(",", ".")) : null}
            costValues={{
              cost_preset_id: form.cost_preset_id,
              cost_material_pct: form.cost_material_pct,
              cost_overhead_pct: form.cost_overhead_pct,
              cost_doprava_pct: form.cost_doprava_pct,
              cost_production_pct: form.cost_production_pct,
              cost_subcontractors_pct: form.cost_subcontractors_pct,
              cost_montaz_pct: form.cost_montaz_pct,
              cost_is_custom: form.cost_is_custom,
            }}
            onChange={(updates) => setForm((s) => ({ ...s, ...updates }))}
            readOnly={isSectionReadOnly("finance")}
            kalkulantSlot={
              <div>
                <Label className="text-xs">Kalkulant</Label>
                {isSectionReadOnly("finance") ? (
                  <Input value={form.kalkulant || "—"} disabled className={roClass} />
                ) : (
                  <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
                )}
              </div>
            }
          />
        )}
        {!isAdmin && (
          <div>
            <Label className="text-xs">Kalkulant</Label>
            {isSectionReadOnly("finance") ? (
              <Input value={form.kalkulant || "—"} disabled className={roClass} />
            ) : (
              <PeopleSelectDropdown role="Kalkulant" value={form.kalkulant} onValueChange={(v) => setForm(s => ({ ...s, kalkulant: v }))} placeholder="Vyberte kalkulanta" />
            )}
          </div>
        )}
      </div>

      {/* ── PM — ŘÍZENÍ PROJEKTU ─────────────────── */}
      <SectionHeader icon="📊" label="PM — ŘÍZENÍ PROJEKTU" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div>
          <Label className="text-xs">PM</Label>
          <MobileTapField displayValue={form.pm || ""} disabled={isSectionReadOnly("pm") || isFieldReadOnly("pm")}>
            {() => isSectionReadOnly("pm") || isFieldReadOnly("pm") ? (
              <Input value={form.pm || "—"} disabled className={roClass} />
            ) : (
              <PeopleSelectDropdown role="PM" value={form.pm} onValueChange={(v) => setForm(s => ({ ...s, pm: v }))} placeholder="Vyberte PM" />
            )}
          </MobileTapField>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <MobileTapField displayValue={form.status || ""} disabled={isSectionReadOnly("pm")}>
            {() => isSectionReadOnly("pm") ? (
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
          </MobileTapField>
        </div>

        <div>
          <Label className="text-xs">Risk</Label>
          <MobileTapField displayValue={form.risk || ""} disabled={isSectionReadOnly("pm") || isFieldReadOnly("risk")}>
            {() => isSectionReadOnly("pm") || isFieldReadOnly("risk") ? (
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
          </MobileTapField>
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
            <CompactDateField label="VaN" value={form.van_date} onChange={(v) => setForm(s => ({ ...s, van_date: v }))} disabled={isSectionReadOnly("pm")} />
          </div>
        </div>

        <div className="col-span-2">
          <Label className="text-xs">Poznámka PM</Label>
          <MobileTapField displayValue={form.pm_poznamka || ""} disabled={isSectionReadOnly("pm")}>
            {({ autoFocus }) => (
              <Textarea
                value={form.pm_poznamka}
                onChange={(e) => setForm(s => ({ ...s, pm_poznamka: e.target.value }))}
                disabled={isSectionReadOnly("pm")}
                className={cn("min-h-[50px] text-sm", isSectionReadOnly("pm") && roClass)}
                placeholder="Poznámka…"
                autoFocus={autoFocus}
              />
            )}
          </MobileTapField>
        </div>
      </div>

      {/* ── TPV — TECHNICKÁ PŘÍPRAVA ─────────────── */}
      <SectionHeader icon="🔧" label="TPV — TECHNICKÁ PŘÍPRAVA" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pb-2">
        <div>
          <Label className="text-xs">Konstruktér</Label>
          <MobileTapField displayValue={form.konstrukter || ""} disabled={isSectionReadOnly("tpv")}>
            {() => isSectionReadOnly("tpv") ? (
              <Input value={form.konstrukter || "—"} disabled className={roClass} />
            ) : (
              <PeopleSelectDropdown role="Konstruktér" value={form.konstrukter} onValueChange={(v) => setForm(s => ({ ...s, konstrukter: v }))} placeholder="Vyberte konstruktéra" />
            )}
          </MobileTapField>
        </div>
        <div>
          <Label className="text-xs">Náročnost</Label>
          <MobileTapField displayValue={form.narocnost || ""} disabled={isSectionReadOnly("tpv")}>
            {() => isSectionReadOnly("tpv") ? (
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
          </MobileTapField>
        </div>
        <div>
          <Label className="text-xs">Hodiny TPV</Label>
          <MobileTapField displayValue={form.hodiny_tpv || ""} disabled={isSectionReadOnly("tpv")}>
            {({ autoFocus }) => (
              <Input
                value={form.hodiny_tpv}
                onChange={(e) => setForm(s => ({ ...s, hodiny_tpv: e.target.value }))}
                disabled={isSectionReadOnly("tpv")}
                className={cn(isSectionReadOnly("tpv") && roClass)}
                autoFocus={autoFocus}
              />
            )}
          </MobileTapField>
        </div>
        <div>
          <Label className="text-xs">% Rozpracovanost</Label>
          <MobileTapField displayValue={form.percent_tpv ? `${form.percent_tpv} %` : ""} disabled={isSectionReadOnly("tpv")}>
            {({ autoFocus }) => (
              <div className="relative">
                <Input
                  type={isSectionReadOnly("tpv") ? "text" : "number"}
                  className={cn("no-spinners pr-8", isSectionReadOnly("tpv") && roClass)}
                  value={isSectionReadOnly("tpv") ? (form.percent_tpv ? `${form.percent_tpv}` : "—") : form.percent_tpv}
                  onChange={(e) => setForm(s => ({ ...s, percent_tpv: e.target.value }))}
                  placeholder="0"
                  disabled={isSectionReadOnly("tpv")}
                  autoFocus={autoFocus}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
              </div>
            )}
          </MobileTapField>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Poznámka TPV</Label>
          <MobileTapField displayValue={form.tpv_poznamka || ""} disabled={isSectionReadOnly("tpv")}>
            {({ autoFocus }) => (
              <Textarea
                value={form.tpv_poznamka}
                onChange={(e) => setForm(s => ({ ...s, tpv_poznamka: e.target.value }))}
                disabled={isSectionReadOnly("tpv")}
                className={cn("min-h-[50px] text-sm", isSectionReadOnly("tpv") && roClass)}
                placeholder="Poznámka…"
                autoFocus={autoFocus}
              />
            )}
          </MobileTapField>
        </div>
      </div>
    </>
  );

  // ── Embedded mode: form only, no Dialog shell ──────────────
  if (mode === "embedded") {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-4 pb-20">
          {formFieldsContent}
        </div>
        <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 flex items-center justify-end gap-2 z-10">
          {canEdit && <Button onClick={handleSave} disabled={idExists || !form.project_id} size="sm">Uložit</Button>}
        </div>
        <ConfirmDialog
          open={unsavedConfirmOpen}
          onConfirm={() => { setUnsavedConfirmOpen(false); }}
          onCancel={() => setUnsavedConfirmOpen(false)}
          description="Máte neuložené změny. Opravdu chcete zavřít?"
        />
      </>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && previewFile) { setPreviewFile(null); return; }
      if (!v) { tryClose(); return; }
    }}>
      <DialogContent
        ref={mobileSheetRef}
        data-mobile-top-sheet={isMobile ? "" : undefined}
        className={cn(
          "p-0 gap-0 overflow-hidden",
          previewFile ? "sm:max-w-[92vw] h-[88vh]" : "sm:max-w-[920px]",
          "max-md:!max-w-full max-md:!w-full max-md:!left-0 max-md:!translate-x-0 max-md:!translate-y-0 max-md:!rounded-none max-md:!border-0",
        )}
        style={isMobile ? {
          top: 0,
          bottom: 0,
          height: "100vh",
          paddingTop: "env(safe-area-inset-top, 0px)",
          ...(mobileDragY > 0 ? { transform: `translateY(${mobileDragY}px)`, transition: 'none' } : {}),
        } : undefined}
        onOpenAutoFocus={(e) => {
          if (isMobile) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (previewFile) {
            e.preventDefault();
            setPreviewFile(null);
          }
        }}
        onTouchStart={handleMobileTouchStart}
        onTouchMove={handleMobileTouchMove}
        onTouchEnd={handleMobileTouchEnd}
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
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <DialogHeader className="px-6 pt-4 md:pt-6 pb-4">
              <DialogTitle className="text-base md:text-lg">{project.project_id} — {project.project_name}</DialogTitle>
            </DialogHeader>

            <div className="flex max-md:flex-col max-md:overflow-y-auto" style={{ maxHeight: '78vh' }}>
              {/* LEFT PANEL — Form fields */}
              <div className="flex-1 px-6 pb-4 overflow-y-auto max-md:overflow-visible">
                {formFieldsContent}
              </div>

              {/* RIGHT PANEL — Documents (below form on mobile) */}
              <div className="w-[340px] max-md:w-full shrink-0 border-l max-md:border-l-0 max-md:border-t border-border bg-muted/30 flex flex-col">
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
                        <FolderDropTarget
                          key={cat.key}
                          categoryKey={cat.key}
                          categoryLabel={cat.label}
                          isValidTarget={fileDragActive && fileDragSourceCat !== cat.key}
                          isInvalidTarget={fileDragActive && fileDragSourceCat === cat.key}
                          isDragActive={fileDragActive}
                          onDrop={handleFolderDrop}
                        >
                          <button
                            type="button"
                            onClick={() => { handleToggleCategory(cat.key); fileSelection.clearSelection(); }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all duration-200",
                              isOpen
                                ? "border-[hsl(var(--primary))] bg-primary/5 text-foreground"
                                : "border-border bg-background text-foreground hover:bg-accent",
                              flashingCategory === cat.key && "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)] animate-pulse"
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
                              ) : cat.key === "fotky" ? (
                                  <>
                                  {/* Photo timeline grid for Fotky category */}
                                  <PhotoTimelineGrid
                                    files={files}
                                    maxHeight="260px"
                                    canDelete={canUploadDocuments}
                                    onDelete={(f) => { handleDeleteFile("fotky", f.name); }}
                                    onOpenLightbox={(index) => {
                                      const imageFiles = files.filter((f) => isImageFile(f.name));
                                      if (imageFiles[index]) {
                                        setPhotoLightbox({ files: imageFiles, index });
                                      }
                                    }}
                                    isDraggable={canUploadDocuments && !isMobile}
                                    onDragStart={(e, f) => handleFileDragStart(e, f, "fotky")}
                                    onDragEnd={handleFileDragEnd}
                                    draggingFileId={fileDragActive && fileDragSourceCat === "fotky" ? [...fileSelection.selected][0] ?? null : null}
                                    selectedIds={openCategory === "fotky" ? fileSelection.selected : undefined}
                                    onToggleSelect={(fileId, allFiles, e) => fileSelection.toggleFile(fileId, allFiles, e)}
                                  />
                                  {/* Selection bar for photos */}
                                  {fileSelection.selectedCount > 0 && openCategory === "fotky" && !isMobile && (
                                    <FileSelectionBar
                                      selectedCount={fileSelection.selectedCount}
                                      categories={DOC_CATEGORIES}
                                      currentCategory="fotky"
                                      onMoveTo={handleSelectionBarMove}
                                      onClear={fileSelection.clearSelection}
                                    />
                                  )}
                                  </>
                                ) : (
                                <>
                                  <div className="space-y-0.5 max-h-[140px] overflow-y-auto" onClick={(e) => {
                                    // Click empty area = deselect
                                    if (e.target === e.currentTarget) fileSelection.clearSelection();
                                  }}>
                                    {files.map((f) => {
                                      const fileKey = `${cat.key}:${f.name}`;
                                      const isDeleting = deletingFile === fileKey;
                                      const isFileSelected = fileSelection.isSelected(f.itemId);
                                      const isBeingDragged = fileDragActive && isFileSelected && fileDragSourceCat === cat.key;
                                      
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
                                        <div
                                          key={f.name}
                                          draggable={canUploadDocuments && !isMobile}
                                          onDragStart={(e) => handleFileDragStart(e, f, cat.key)}
                                          onDragEnd={handleFileDragEnd}
                                          className={cn(
                                            "group flex items-center gap-1 py-1 px-1 rounded hover:bg-accent/50 text-xs relative transition-all",
                                            canUploadDocuments && !isMobile && "cursor-grab active:cursor-grabbing",
                                            isFileSelected && "bg-primary/5",
                                            isBeingDragged && "opacity-40 border-2 border-dashed border-border rounded-md bg-muted/30"
                                          )}
                                          onClick={(e) => {
                                            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                              e.stopPropagation();
                                              fileSelection.toggleFile(f.itemId, files, e);
                                            } else if (fileSelection.selectedCount > 0) {
                                              e.stopPropagation();
                                              fileSelection.toggleFile(f.itemId, files, e);
                                            } else {
                                              handlePreview(f, cat.key);
                                            }
                                          }}
                                        >
                                          {/* Selection checkbox */}
                                          {canUploadDocuments && !isMobile && (
                                            <button
                                              type="button"
                                              className={cn(
                                                "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all mr-0.5",
                                                isFileSelected
                                                  ? "border-primary bg-primary text-primary-foreground"
                                                  : fileSelection.selectedCount > 0
                                                    ? "border-border"
                                                    : "border-transparent group-hover:border-border"
                                              )}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                fileSelection.toggleFile(f.itemId, files, e);
                                              }}
                                            >
                                              {isFileSelected && <span className="text-[8px] leading-none">✓</span>}
                                            </button>
                                          )}
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
                                  {/* Selection bar */}
                                  {fileSelection.selectedCount > 0 && openCategory === cat.key && !isMobile && (
                                    <FileSelectionBar
                                      selectedCount={fileSelection.selectedCount}
                                      categories={DOC_CATEGORIES}
                                      currentCategory={cat.key}
                                      onMoveTo={handleSelectionBarMove}
                                      onClear={fileSelection.clearSelection}
                                    />
                                  )}
                                </>
                              )}

                              {canUploadDocuments && (
                                <>
                                  {/* Active upload progress bars */}
                                  {Object.entries(chunked.uploads).map(([id, upload]) => (
                                    <UploadProgressBar
                                      key={id}
                                      upload={upload}
                                      onCancel={() => chunked.cancelUpload(id)}
                                      onDismiss={() => chunked.removeUpload(id)}
                                      onRetry={upload.status === "error" ? () => {
                                        chunked.removeUpload(id);
                                        // User should re-drop or re-select to retry
                                      } : undefined}
                                    />
                                  ))}
                                  {cat.key === "fotky" && (
                                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                      <input
                                        type="checkbox"
                                        checked={reklamaceToggle}
                                        onChange={(e) => setReklamaceToggle(e.target.checked)}
                                        className="h-3 w-3 rounded border-border accent-red-500"
                                      />
                                      <span className={reklamaceToggle ? "text-red-500 font-medium" : ""}>
                                        Označit jako reklamaci / škodu
                                      </span>
                                    </label>
                                  )}
                                  <div
                                    className={cn(
                                      "relative rounded-md border-2 border-dashed border-muted-foreground/30 bg-background flex flex-col items-center justify-center py-3 px-2 cursor-pointer hover:border-muted-foreground/50 transition-colors",
                                      sp.uploading && "pointer-events-none opacity-60",
                                      dragOverCategory === cat.key && "border-primary bg-primary/5"
                                    )}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCategory(cat.key); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCategory(null); }}
                                    onDrop={(e) => { setDragOverCategory(null); handleFileDrop(e, cat.key); }}
                                    onClick={() => { activeUploadCatRef.current = cat.key; fileInputRef.current?.click(); }}
                                  >
                                    {sp.uploading ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <>
                                        <Upload className={cn("h-4 w-4 mb-1", dragOverCategory === cat.key ? "text-primary" : "text-muted-foreground")} />
                                        <p className={cn("text-[10px] text-center", dragOverCategory === cat.key ? "text-primary" : "text-muted-foreground")}>
                                          {cat.key === "fotky" ? "Přetáhněte fotku nebo vyberte" : "Přetáhněte soubor nebo vyberte (max 100 MB)"}
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
                        </FolderDropTarget>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0 max-md:sticky max-md:bottom-0 max-md:bg-background max-md:z-10 max-md:flex-wrap max-md:gap-2 max-md:pb-[env(safe-area-inset-bottom,0px)]">

              <div className="flex items-center gap-2">
                {/* Mobile: TPV list link */}
                {onOpenTPVList && project && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="md:hidden gap-1.5 text-primary"
                    onClick={() => { onOpenChange(false); onOpenTPVList(project.project_id, project.project_name); }}
                  >
                    <List className="h-3.5 w-3.5" />
                    Zobrazit položky
                  </Button>
                )}
                {/* Desktop: delete */}
                <div className="hidden md:flex items-center gap-2">
                {canDeleteProject && !isViewer && (
                  <>
                    {deleteStep === 0 && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteStep(1)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Smazat projekt
                      </Button>
                    )}
                    {deleteStep === 1 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Opravdu smazat projekt?</span>
                        {(() => { const tc = Object.values(sp.filesByCategory).reduce((s, f) => s + f.length, 0); return tc > 0; })() ? (
                          <>
                            <span className="text-destructive font-medium">⚠ Projekt obsahuje {Object.values(sp.filesByCategory).reduce((s, f) => s + f.length, 0)} souborů</span>
                            <button type="button" className="text-destructive font-medium hover:underline" onClick={() => setDeleteStep(0)}>Zrušit</button>
                            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setDeleteStep(2)}>Pokračovat</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="text-destructive font-medium hover:underline" onClick={() => setDeleteStep(0)}>Zrušit</button>
                            <button type="button" className="text-muted-foreground hover:underline" onClick={handleDelete}>Smazat</button>
                          </>
                        )}
                      </div>
                    )}
                    {deleteStep === 2 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-destructive font-medium">Soubory budou archivovány. Potvrdit smazání?</span>
                        <button type="button" className="text-destructive font-medium hover:underline" onClick={() => setDeleteStep(0)}>Zrušit</button>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={handleDelete}>Smazat</button>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>

              {/* Right side — actions */}
              <div className="flex items-center gap-2 max-md:ml-auto">
                {onOpenTPVList && (
                  <div className="hidden md:contents">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (project) { onOpenChange(false); onOpenTPVList(project.project_id, project.project_name, true); }
                      }}
                    >
                      <Upload className="h-3 w-3 mr-1" /> Import z Excelu
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => {
                        if (project) { onOpenChange(false); onOpenTPVList(project.project_id, project.project_name); }
                      }}
                    >
                      <List className="h-3.5 w-3.5" />
                      počet položek
                      <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                        {tpvItemCount ?? 0}
                      </Badge>
                    </Button>
                  </div>
                )}
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
    <PhotoLightbox
      open={!!photoLightbox}
      onClose={() => setPhotoLightbox(null)}
      files={photoLightbox?.files ?? []}
      initialIndex={photoLightbox?.index ?? 0}
      projectName={project?.project_name}
      canDelete={canUploadDocuments}
      onDelete={(f) => {
        handleDeleteFile("fotky", f.name);
        setPhotoLightbox((prev) => {
          if (!prev) return null;
          const updated = prev.files.filter((pf) => pf.itemId !== f.itemId);
          if (updated.length === 0) return null;
          return { files: updated, index: Math.min(prev.index, updated.length - 1) };
        });
      }}
    />
    </>
  );
}
