import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { useTPVItems } from "@/hooks/useTPVItems";
import { useSharePointDocs, type SPFile, CATEGORY_FOLDER_MAP } from "@/hooks/useSharePointDocs";
import { ProjectDetailDialog, type ProjectDetailProject } from "@/components/ProjectDetailDialog";
import { isImageFile, PhotoTimelineGrid } from "@/components/PhotoLightbox";
import { ChevronLeft, ChevronRight, ChevronDown, FileText, Package, Info, Plus, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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

type TabKey = "info" | "tpv" | "docs";

const TABS: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: "info", label: "Info", icon: Info },
  { key: "tpv", label: "Položky", icon: Package },
  { key: "docs", label: "Dokumenty", icon: FileText },
];

export function MobileDetailProjektSheet({ project, open, onOpenChange, onOpenTPV }: MobileDetailProjektSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const projectId = project?.project_id || "";

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

  // Ref-based swipe-to-dismiss
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });
  const sheetRef = useRef<HTMLDivElement>(null);

  function handleDragTouchStart(e: React.TouchEvent) {
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: true };
  }
  function handleDragTouchMove(e: React.TouchEvent) {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.currentY = e.touches[0].clientY;
    const deltaY = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    sheetRef.current.style.transition = "none";
    sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    const overlay = sheetRef.current.previousElementSibling as HTMLElement | null;
    if (overlay) {
      overlay.style.transition = "none";
      overlay.style.opacity = String(1 - Math.min(deltaY / 300, 1));
    }
  }
  function handleDragTouchEnd() {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.dragging = false;
    const finalY = dragRef.current.currentY - dragRef.current.startY;
    const el = sheetRef.current;
    const overlay = el.previousElementSibling as HTMLElement | null;
    if (finalY > 80) {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = `translateY(${el.offsetHeight}px)`;
      if (overlay) { overlay.style.transition = "opacity 0.2s ease"; overlay.style.opacity = "0"; }
      setTimeout(() => onOpenChange(false), 200);
    } else {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "translateY(0)";
      if (overlay) { overlay.style.transition = "opacity 0.2s ease"; overlay.style.opacity = "1"; }
    }
  }

  const { data: tpvItems = [] } = useTPVItems(projectId);

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        className="h-[85vh] rounded-t-2xl p-0 overflow-hidden flex flex-col"
        style={{ touchAction: "none" }}
        onPointerDownOutside={(e) => { e.preventDefault(); onOpenChange(false); }}
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
          <p className="text-[11px] font-mono text-muted-foreground">{project.project_id}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[15px] font-semibold text-foreground truncate min-w-0 flex-1">{project.project_name}</p>
            {project.status && <StatusBadge status={project.status} />}
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
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "info" && (
            <ProjectDetailDialog
              project={project as ProjectDetailProject}
              open={true}
              onOpenChange={onOpenChange}
              mode="embedded"
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
        </div>
      </SheetContent>
    </Sheet>
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">{item.item_name}</span>
              {item.item_type && (
                <span className="text-[12px] font-medium text-foreground truncate">{item.item_type}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(item.vyroba_status || item.status) && (
              <StatusBadge status={item.vyroba_status || item.status} />
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
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

function FotkyCategorySection({ rawFiles, isOpen, onToggle, onUpload }: {
  rawFiles: SPFile[];
  isOpen: boolean;
  onToggle: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [fotkyFilter, setFotkyFilter] = useState<"all" | "vyroba">("all");
  const files = fotkyFilter === "vyroba"
    ? rawFiles.filter(f => f.name.includes("-Log-"))
    : rawFiles;

  return (
    <div className="bg-card rounded-[10px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
      <div
        className="flex items-center gap-2 px-4 cursor-pointer active:bg-accent/50 transition-colors"
        style={{ minHeight: 48, borderBottom: isOpen ? "0.5px solid hsl(var(--border))" : undefined }}
        onClick={onToggle}
      >
        <span className="text-sm shrink-0">📷</span>
        <span className="uppercase text-[11px] font-semibold tracking-wide text-muted-foreground flex-1">
          Fotky ({files.length})
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
        <label
          className="flex items-center justify-center w-7 h-7 rounded-full cursor-pointer active:opacity-70"
          style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="h-3.5 w-3.5" />
          <input type="file" multiple className="hidden" accept="image/*" onChange={onUpload} />
        </label>
      </div>
      {isOpen && (
        <>
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
          {files.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-muted-foreground">Žádné soubory</div>
          ) : (
            files.map((file: SPFile, idx: number) => (
              <a
                key={file.itemId || file.name}
                href={file.downloadUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                style={{ borderBottom: idx < files.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
              >
                <span className="text-sm shrink-0">📷</span>
                <span className="text-[12px] font-medium text-foreground truncate flex-1">{file.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              </a>
            ))
          )}
        </>
      )}
    </div>
  );
}

function DocsTabContent({ projectId }: { projectId: string }) {
  const sp = useSharePointDocs(projectId);
  const { filesByCategory, initialLoading } = sp;
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const [key, files] of Object.entries(filesByCategory)) {
      if (files.length > 0) initial.add(key);
    }
    return initial;
  });
  const { profile } = useAuth();

  // Load all categories on mount
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

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {CATEGORY_ORDER.map((catKey) => {
        if (catKey === "fotky") {
          return <FotkyCategorySection key={catKey} rawFiles={filesByCategory["fotky"] || []} isOpen={openCategories.has("fotky")} onToggle={() => setOpenCategories(prev => { const next = new Set(prev); next.has("fotky") ? next.delete("fotky") : next.add("fotky"); return next; })} onUpload={(e) => handleMobileUpload("fotky", e)} />;
        }
        const rawFiles = filesByCategory[catKey] || [];
        const icon = CATEGORY_ICONS[catKey] || "📄";
        const isOpen = openCategories.has(catKey);
        return (
          <div key={catKey} className="bg-card rounded-[10px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
            <div
              className="flex items-center gap-2 px-4 cursor-pointer active:bg-accent/50 transition-colors"
              style={{ minHeight: 48, borderBottom: isOpen ? "0.5px solid hsl(var(--border))" : undefined }}
              onClick={() => setOpenCategories(prev => {
                const next = new Set(prev);
                next.has(catKey) ? next.delete(catKey) : next.add(catKey);
                return next;
              })}
            >
              <span className="text-sm shrink-0">{icon}</span>
              <span className="uppercase text-[11px] font-semibold tracking-wide text-muted-foreground flex-1">
                {CATEGORY_LABELS[catKey] || catKey} ({rawFiles.length})
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
              <label
                className="flex items-center justify-center w-7 h-7 rounded-full cursor-pointer active:opacity-70"
                style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Plus className="h-3.5 w-3.5" />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="*/*"
                  onChange={(e) => handleMobileUpload(catKey, e)}
                />
              </label>
            </div>
            {isOpen && (
              rawFiles.length === 0 ? (
                <div className="px-4 py-3 text-[12px] text-muted-foreground">Žádné soubory</div>
              ) : (
                rawFiles.map((file: SPFile, idx: number) => (
                  <a
                    key={file.itemId || file.name}
                    href={file.downloadUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                    style={{ borderBottom: idx < rawFiles.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
                  >
                    <span className="text-sm shrink-0">{icon}</span>
                    <span className="text-[12px] font-medium text-foreground truncate flex-1">{file.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  </a>
                ))
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
