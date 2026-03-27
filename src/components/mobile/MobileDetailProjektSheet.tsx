import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { useTPVItems } from "@/hooks/useTPVItems";
import { useSharePointDocs, type SPFile, CATEGORY_FOLDER_MAP } from "@/hooks/useSharePointDocs";
import { ProjectDetailDialog, type ProjectDetailProject } from "@/components/ProjectDetailDialog";
import { isImageFile, PhotoTimelineGrid, PhotoLightbox, generatePhotoFilename } from "@/components/PhotoLightbox";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { ChevronLeft, ChevronRight, ChevronDown, FileText, Package, Info, Plus, Camera, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";


interface Project {
  id: string;
  project_id: string;
  project_name: string;
  klient?: string | null;
  pm?: string | null;
  status?: string | null;
  prodejni_cena?: number | null;
  currency?: string | null;
  datum_smluvni?: string | null;
  risk?: string | null;
  konstrukter?: string | null;
  kalkulant?: string | null;
  architekt?: string | null;
  narocnost?: string | null;
  location?: string | null;
  pm_poznamka?: string | null;
  tpv_poznamka?: string | null;
  marze?: string | null;
  [key: string]: any;
}

interface MobileDetailProjektSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTPV?: (project: Project) => void;
}

type TabKey = "info" | "tpv" | "docs" | "foto";

const TABS: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: "info", label: "Info", icon: Info },
  { key: "tpv", label: "Položky", icon: Package },
  { key: "docs", label: "Dokumenty", icon: FileText },
  { key: "foto", label: "Foto", icon: Camera },
];

export function MobileDetailProjektSheet({ project, open, onOpenChange, onOpenTPV }: MobileDetailProjektSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null | undefined>(project?.status);
  const projectId = project?.project_id || "";
  const { data: statuses = [] } = useProjectStatusOptions();
  const queryClient = useQueryClient();

  // Sync local status when project prop changes
  useEffect(() => {
    setLocalStatus(project?.status);
  }, [project?.status]);

  const handleStatusChange = async (newStatus: string) => {
    if (!project) return;
    const oldStatus = localStatus;
    setLocalStatus(newStatus);
    setStatusPickerOpen(false);
    const { error } = await supabase.from("projects")
      .update({ status: newStatus })
      .eq("project_id", project.project_id);
    if (error) {
      setLocalStatus(oldStatus);
      toast.error("Nepodařilo se změnit status");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  // Reset tab when project changes
  useEffect(() => {
    if (open) setActiveTab("info");
  }, [project?.project_id, open]);

  // Close on mobile nav change
  useEffect(() => {
    const handler = () => onOpenChange(false);
    window.addEventListener("mobile-nav-change", handler);
    return () => window.removeEventListener("mobile-nav-change", handler);
  }, [onOpenChange]);

  // Vertical swipe-down-to-dismiss on drag handle only
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, active: false });
  function handleDragTouchStart(e: React.TouchEvent) {
    dragRef.current = { startY: e.touches[0].clientY, active: true };
  }
  function handleDragTouchMove(e: React.TouchEvent) {
    if (!dragRef.current.active) return;
    const dy = Math.max(0, e.touches[0].clientY - dragRef.current.startY);
    const el = sheetRef.current;
    if (el) { el.style.transition = "none"; el.style.transform = `translateY(${dy}px)`; }
  }
  function handleDragTouchEnd(e: React.TouchEvent) {
    dragRef.current.active = false;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    const el = sheetRef.current;
    if (!el) return;
    if (dy > 80) {
      el.style.transition = "transform 0.2s ease"; el.style.transform = "translateY(100%)";
      const overlay = el.previousElementSibling as HTMLElement | null;
      if (overlay) { overlay.style.transition = "opacity 0.2s ease"; overlay.style.opacity = "0"; }
      setTimeout(() => onOpenChange(false), 220);
    } else {
      el.style.transition = "transform 0.2s ease"; el.style.transform = "translateY(0)";
    }
  }

  const { data: tpvItems = [] } = useTPVItems(projectId);

  if (!project) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        className="rounded-t-2xl p-0 overflow-hidden flex flex-col h-[85vh] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        onTouchStart={(e: React.TouchEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.dataset.swipeStartY = String(e.touches[0].clientY);
          el.dataset.swipeStartX = String(e.touches[0].clientX);
          el.dataset.swiping = "false";
          el.style.transition = "none";
        }}
        onTouchMove={(e: React.TouchEvent) => {
          const el = e.currentTarget as HTMLElement;
          if (el.dataset.swiping === "cancelled") return;
          const startY = Number(el.dataset.swipeStartY);
          const startX = Number(el.dataset.swipeStartX);
          const dy = e.touches[0].clientY - startY;
          const dx = Math.abs(e.touches[0].clientX - startX);
          const height = el.offsetHeight || 600;
          const activationThreshold = height * 0.3;
          if (dx > dy * 0.5 && dy < activationThreshold) {
            el.dataset.swiping = "cancelled";
            return;
          }
          if (dy < activationThreshold) return;
          e.preventDefault();
          el.dataset.swiping = "true";
          el.style.transform = `translateY(${Math.max(0, dy)}px)`;
        }}
        onTouchEnd={(e: React.TouchEvent) => {
          const el = e.currentTarget as HTMLElement;
          if (el.dataset.swiping !== "true") return;
          const startY = Number(el.dataset.swipeStartY);
          const dy = e.changedTouches[0].clientY - startY;
          el.style.transition = "transform 220ms ease";
          if (dy > (el.offsetHeight || 600) * 0.3) {
            el.style.transform = `translateY(${el.offsetHeight}px)`;
            setTimeout(() => onOpenChange(false), 220);
          } else {
            el.style.transform = "translateY(0)";
          }
          el.dataset.swiping = "false";
        }}
      >
        <SheetTitle className="sr-only">{project.project_name}</SheetTitle>

        {/* Top bar with back button + drag handle */}
        <div
          className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
          onTouchStart={handleDragTouchStart}
          onTouchMove={handleDragTouchMove}
          onTouchEnd={handleDragTouchEnd}
        >
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs font-medium flex items-center gap-1 min-h-[36px]"
            style={{ color: "#6b7280" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Zpět
          </button>
          <div className="w-10 h-1 rounded-full" style={{ background: "#d0cdc8" }} />
          <div className="w-[50px]" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 shrink-0" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          <p className="text-[11px] font-sans text-muted-foreground">{project.project_id}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[15px] font-semibold text-foreground truncate min-w-0 flex-1">{project.project_name}</p>
            {localStatus && (
              <button onClick={() => setStatusPickerOpen(true)} className="appearance-none">
                <StatusBadge status={localStatus} />
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 px-4 gap-1 pt-2 pb-1" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors min-h-[32px]",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
                style={isActive ? { backgroundColor: "#223937" } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.key === "tpv" && tpvItems.length > 0 && (
                  <span className={cn(
                    "text-[10px] ml-0.5 px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-white/20" : "bg-muted"
                  )}>
                    {tpvItems.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ paddingBottom: "56px" }}>
          {activeTab === "info" && (
            <ProjectDetailDialog
              project={project as ProjectDetailProject}
              open={true}
              onOpenChange={onOpenChange}
              mode="embedded"
              readOnly
            />
          )}
          {activeTab === "tpv" && (
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
              <TPVTabContent items={tpvItems} currency={project.currency || "CZK"} />
            </div>
          )}
          {activeTab === "docs" && (
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
              <DocsTabContent projectId={projectId} />
            </div>
          )}
          {activeTab === "foto" && (
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
              <FotoTabContent projectId={projectId} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Status picker sheet */}
    <Sheet open={statusPickerOpen} onOpenChange={setStatusPickerOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-8 bottom-[56px] max-h-[calc(100svh-112px)]">
        <div className="px-4 pb-3" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          <SheetTitle className="text-base font-semibold">Změnit status</SheetTitle>
        </div>
        <div className="flex flex-col py-1">
          {statuses.map(s => (
            <button
              key={s.id}
              onClick={() => handleStatusChange(s.label)}
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
              </div>
              {project.status === s.label && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

function FotoTabContent({ projectId }: { projectId: string }) {
  const { uploadFile, filesByCategory, listFiles, uploading } = useSharePointDocs(projectId);
  const { profile } = useAuth();

  useEffect(() => {
    if (projectId) listFiles("fotky");
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = useMemo(() => {
    const all = filesByCategory["fotky"] || [];
    return all.filter(f => isImageFile(f.name) && !f.name.includes("-Log-"))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  }, [filesByCategory]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const captureDate = file.lastModified ? new Date(file.lastModified) : new Date();
      const dateStr = `${captureDate.getFullYear()}-${String(captureDate.getMonth() + 1).padStart(2, "0")}-${String(captureDate.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(captureDate.getHours()).padStart(2, "0")}${String(captureDate.getMinutes()).padStart(2, "0")}${String(captureDate.getSeconds()).padStart(2, "0")}`;
      const userSuffix = profile?.full_name
        ? profile.full_name.trim().split(" ").pop()!.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        : "user";
      const ext = file.name.split(".").pop() || "jpg";
      const autoName = `${projectId}-${dateStr}_${timeStr}-${userSuffix}.${ext}`;
      const renamed = new File([file], autoName, { type: file.type });
      try {
        await uploadFile("fotky", renamed);
        toast.success(`✓ ${autoName}`);
      } catch {
        toast.error("Upload selhal");
      }
    }
    listFiles("fotky");
    if (e.target) e.target.value = "";
  }, [uploadFile, listFiles, projectId, profile]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <label
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl cursor-pointer active:opacity-70 font-medium text-[13px]"
        style={{ border: "2px dashed hsl(var(--border))", color: "hsl(var(--primary))" }}
      >
        <Camera className="h-4 w-4" />
        Přidat foto
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {photos.length === 0 ? (
        <p className="text-[12px] text-muted-foreground text-center py-4">Žádné fotky</p>
      ) : (
        <PhotoTimelineGrid
          files={photos}
          onOpenLightbox={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
        />
      )}
      <PhotoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        files={photos}
        initialIndex={lightboxIndex}
        projectName={projectId}
      />
    </div>
  );
}

function TPVTabContent({ items, currency }: { items: any[]; currency: string }) {
  if (items.length === 0) {
    return <p className="text-[12px] text-muted-foreground text-center py-8">Žádné TPV položky</p>;
  }

  return (
    <div className="bg-card rounded-[10px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: idx < items.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
        >
           <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
            <span className="text-[12px] font-bold font-sans text-foreground shrink-0">{item.item_name}</span>
             {item.item_type && (
               <span className="text-[12px] text-muted-foreground truncate">{item.item_type}</span>
             )}
          </div>
          <div className="flex items-center shrink-0 ml-auto">
            {(item.vyroba_status || item.status) && (
              <StatusBadge status={item.vyroba_status || item.status} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  cenova_nabidka: "📄",
  smlouva: "📋",
  zadani: "📝",
  vykresy: "📐",
  dokumentace: "📁",
  dodaci_list: "📦",
  fotky: "📷",
};

const CATEGORY_ORDER = ["cenova_nabidka", "smlouva", "zadani", "vykresy", "dokumentace", "dodaci_list", "fotky"];

const CATEGORY_LABELS: Record<string, string> = {
  cenova_nabidka: "Cenová nabídka",
  smlouva: "Smlouva",
  zadani: "Zadání",
  vykresy: "Výkresy",
  dokumentace: "Dokumentace",
  dodaci_list: "Dodací list",
  fotky: "Fotky",
};

function FotkyCategorySection({ projectId, rawFiles, isOpen, onToggle, onUpload }: {
  projectId: string;
  rawFiles: SPFile[];
  isOpen: boolean;
  onToggle: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [fotkyFilter, setFotkyFilter] = useState<"all" | "vyroba">("all");
  const filtered = fotkyFilter === "vyroba"
    ? rawFiles.filter(f => f.name.includes("-Log-"))
    : rawFiles;

  const photos = useMemo(() =>
    filtered.filter(f => isImageFile(f.name))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    [filtered]
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  return (
    <>
      <div className="bg-card rounded-[12px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 min-h-[48px] cursor-pointer select-none"
          onClick={onToggle}
        >
          <span className="text-[16px]">📷</span>
          <span className="text-[13px] font-medium flex-1">Fotky</span>
          {rawFiles.length > 0 && (
            <span className="text-[11px] text-muted-foreground mr-1">{rawFiles.length}</span>
          )}
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-90")} />
        </div>

        {isOpen && (
          <div style={{ borderTop: "0.5px solid hsl(var(--border))" }}>
            <div className="flex gap-1.5 px-4 py-2" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
              {(["all", "vyroba"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFotkyFilter(f)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                    fotkyFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {f === "all" ? "Vše" : "Výroba"}
                </button>
              ))}
            </div>

            {photos.length > 0 && (
              <div className="px-3 py-3">
                <PhotoTimelineGrid
                  files={photos}
                  onOpenLightbox={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
                />
              </div>
            )}

            <label
              className="flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70"
              style={{ borderTop: photos.length > 0 ? "0.5px solid hsl(var(--border))" : undefined }}
            >
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[12px] text-muted-foreground">Nahrát foto</span>
              <input type="file" multiple className="hidden" accept="image/*" onChange={onUpload} />
            </label>
          </div>
        )}
      </div>

      <PhotoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        files={photos}
        initialIndex={lightboxIndex}
        projectName={projectId}
      />
    </>
  );
}

function DocsTabContent({ projectId }: { projectId: string }) {
  const sp = useSharePointDocs(projectId);
  const { filesByCategory, initialLoading } = sp;
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [docPreview, setDocPreview] = useState<{ file: SPFile; catKey: string; loading: boolean; previewUrl: string | null } | null>(null);
  const { profile } = useAuth();

  async function openDocPreview(file: SPFile, catKey: string) {
    setDocPreview({ file, catKey, loading: true, previewUrl: null });
    try {
      const preview = await sp.getPreview(file.itemId);
      setDocPreview(prev => prev?.file.itemId === file.itemId ? { ...prev, loading: false, previewUrl: preview.previewUrl } : prev);
    } catch {
      setDocPreview(prev => prev?.file.itemId === file.itemId ? { ...prev, loading: false } : prev);
    }
  }

  const previewFiles = docPreview ? (filesByCategory[docPreview.catKey] ?? []) : [];
  const previewIdx = docPreview ? previewFiles.findIndex(f => f.itemId === docPreview.file.itemId) : 0;
  function handlePreviewNavigate(dir: -1 | 1) {
    const next = previewFiles[previewIdx + dir];
    if (next && docPreview) openDocPreview(next, docPreview.catKey);
  }

  useEffect(() => {
    for (const catKey of Object.keys(CATEGORY_FOLDER_MAP)) {
      sp.listFiles(catKey);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isImageFile = (name: string) => /\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$/i.test(name);

  const userSuffix = profile?.full_name
    ? profile.full_name.trim().split(" ").pop()!
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    : undefined;

  const handleMobileUpload = useCallback(async (catKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    e.target.value = "";

    for (const file of Array.from(fileList)) {
      try {
        let uploadFile = file;
        if (catKey === "fotky" && isImageFile(file.name)) {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
          const baseName = generatePhotoFilename(false, file, projectId, userSuffix);
          const newName = baseName.replace(/\.jpg$/, `.${ext}`);
          uploadFile = new File([file], newName, { type: file.type });
        }
        await sp.uploadFile(catKey, uploadFile);
        toast.success(`Nahráno: ${uploadFile.name}`);
      } catch {
        toast.error(`Chyba při nahrávání: ${file.name}`);
      }
    }
    sp.listFiles(catKey);
  }, [sp, projectId, userSuffix]);

  const toggleCategory = useCallback((key: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {CATEGORY_ORDER.map((catKey) => {
        const rawFiles = filesByCategory[catKey] || [];
        const icon = CATEGORY_ICONS[catKey] || "📄";
        const isOpen = openCategories.has(catKey);

        if (catKey === "fotky") {
          return (
            <FotkyCategorySection
              key={catKey}
              projectId={projectId}
              rawFiles={rawFiles}
              isOpen={isOpen}
              onToggle={() => toggleCategory("fotky")}
              onUpload={(e) => handleMobileUpload("fotky", e)}
            />
          );
        }

        return (
          <div key={catKey} className="bg-card rounded-[12px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
            <div
              className="flex items-center gap-3 px-4 min-h-[48px] cursor-pointer select-none"
              onClick={() => toggleCategory(catKey)}
            >
              <span className="text-[16px]">{icon}</span>
              <span className="text-[13px] font-medium flex-1">
                {CATEGORY_LABELS[catKey] || catKey}
              </span>
              {rawFiles.length > 0 && (
                <span className="text-[11px] text-muted-foreground mr-1">{rawFiles.length}</span>
              )}
              <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-90")} />
            </div>

            {isOpen && (
              <div style={{ borderTop: "0.5px solid hsl(var(--border))" }}>
                {rawFiles.map((file: SPFile, idx: number) => (
                  <div
                    key={file.itemId || file.name}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70"
                    style={{ borderBottom: idx < rawFiles.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
                    onClick={() => openDocPreview(file, catKey)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-[12px] truncate flex-1">{file.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  </div>
                ))}
                <label
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70"
                  style={{ borderTop: rawFiles.length > 0 ? "0.5px solid hsl(var(--border))" : undefined }}
                >
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-[12px] text-muted-foreground">Nahrát dokument</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="*/*"
                    onChange={(e) => handleMobileUpload(catKey, e)}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
      {docPreview && (
        <DocumentPreviewModal
          open={!!docPreview}
          onClose={() => setDocPreview(null)}
          fileName={docPreview.file.name}
          fileSize={docPreview.file.size}
          previewUrl={docPreview.previewUrl}
          webUrl={docPreview.file.webUrl ?? null}
          downloadUrl={docPreview.file.downloadUrl ?? null}
          loading={docPreview.loading}
          totalFiles={previewFiles.length}
          currentIndex={previewIdx}
          onNavigate={previewFiles.length > 1 ? handlePreviewNavigate : undefined}
        />
      )}
    </div>
  );
}
