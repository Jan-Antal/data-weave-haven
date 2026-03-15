import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";

import { PMStatusTable } from "@/components/PMStatusTable";
import { TPVStatusTable } from "@/components/TPVStatusTable";
import { PlanView } from "@/components/PlanView";
import type { ZoomLevel } from "@/components/PlanView";
import { ColumnVisibilityProvider } from "@/components/ColumnVisibilityContext";
import { ExportProvider, useExportContext } from "@/components/ExportContext";
import { exportToExcel, buildFileName } from "@/lib/exportExcel";
import { DashboardStats } from "@/components/DashboardStats";
import { TableFilters, useTableFilters } from "@/components/TableFilters";
import { ExportButton } from "@/components/ExportButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings, Plus, LogOut, User, Check, ChevronUp, ChevronDown, UserCog, Factory, CalendarRange, LayoutDashboard, MessageCircle, Undo2, Redo2, Clock } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

import { AdminInboxButton } from "@/components/AdminInbox";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useState, useRef, useCallback, useEffect } from "react";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { UserManagement } from "@/components/UserManagement";
import { AccountSettings } from "@/components/AccountSettings";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { DataLogPanel } from "@/components/DataLogPanel";
import { CapacitySettings } from "@/components/production/CapacitySettings";
import { DataLogHighlightProvider } from "@/components/DataLogHighlightContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import { useAchievementChecker } from "@/hooks/useAchievements";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileCardList } from "@/components/mobile/MobileCardList";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { MobilePrehled } from "@/components/mobile/MobilePrehled";
import { MobileTPVCardList } from "@/components/mobile/MobileTPVCardList";
import { useRecentlyOpened } from "@/hooks/useRecentlyOpened";
import { useTPVItems, useAddTPVItem } from "@/hooks/useTPVItems";
import { useProductionStatuses } from "@/hooks/useProductionStatuses";
import { useProjects } from "@/hooks/useProjects";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

const Index = () => {
  const navigate = useNavigate();
  const filters = useTableFilters();
  const { openPeopleManagement } = usePeopleManagement();
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);
  const [dataLogOpen, setDataLogOpen] = useState(() => {
    try { return localStorage.getItem("datalog-panel-index") === "true"; } catch { return false; }
  });
  const [activeTab, setActiveTab] = useState("project-info");
  const [riskHighlight, setRiskHighlight] = useState<RiskHighlightType>(null);
  const [savedStatusFilter, setSavedStatusFilter] = useState<string[] | null>(null);
  const [planZoom, setPlanZoom] = useState<ZoomLevel>("3M");
  const [dashboardCollapsed, setDashboardCollapsed] = useState(() => {
    try { return sessionStorage.getItem("dashboard-collapsed") === "true"; } catch { return false; }
  });
  const tpvCloseDetailRef = useRef<(() => void) | null>(null);
  const [tpvListActive, setTpvListActive] = useState(false);
  const [mobileDetailProject, setMobileDetailProject] = useState<any>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileTPVProject, setMobileTPVProject] = useState<any>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const { setCurrentPage, undo, redo, canUndo, canRedo, lastUndoDescription, lastRedoDescription } = useUndoRedo();

  // Set undo page context based on active tab/view
  useEffect(() => {
    if (tpvListActive) {
      setCurrentPage("tpv-list");
    } else {
      setCurrentPage("project-table");
    }
    return () => setCurrentPage(null);
  }, [tpvListActive, setCurrentPage]);

  const TPV_ACTIVE_STATUSES = ["Příprava", "Engineering", "TPV"];

  const toggleDataLog = useCallback(() => {
    setDataLogOpen(prev => {
      const next = !prev;
      try { localStorage.setItem("datalog-panel-index", String(next)); } catch {}
      return next;
    });
  }, []);

  const { profile, signOut, canAccessSettings, canCreateProject, isAdmin, isOwner, realRole, simulatedRole, setSimulatedRole, role, isKonstrukter, canManageUsers, canManagePeople, canManageExchangeRates, canManageStatuses, canAccessRecycleBin, defaultTab } = useAuth();

  const { data: userPrefs } = useUserPreferences();
  const achievementChecker = useAchievementChecker();
  const isMobile = useIsMobile();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const location = useLocation();
  const mobileView = (location.state as any)?.view;
  const mobileTab = mobileView === "projects" ? "projects" : mobileView === "dashboard" ? "prehled" : "prehled";
  const { recent: recentProjects, trackOpen: trackRecentOpen } = useRecentlyOpened();

  const handleTabChange = useCallback((tab: string) => {
    scrollPositions.current[activeTab] = window.scrollY;
    tpvCloseDetailRef.current?.();

    if (tab === "tpv-status" && activeTab !== "tpv-status") {
      setSavedStatusFilter(filters.statusFilter);
      filters.setStatusFilter(TPV_ACTIVE_STATUSES);
    } else if (tab !== "tpv-status" && activeTab === "tpv-status") {
      if (savedStatusFilter !== null) {
        filters.setStatusFilter(savedStatusFilter);
        setSavedStatusFilter(null);
      }
    }
    if (tab === "plan") {
      achievementChecker.checkPlanViewCount();
    }
    setActiveTab(tab);

    requestAnimationFrame(() => {
      const savedPos = scrollPositions.current[tab] ?? 0;
      window.scrollTo(0, savedPos);
    });
  }, [activeTab, filters, savedStatusFilter, achievementChecker]);

  // Check time-based achievements on load
  useEffect(() => {
    achievementChecker.checkTimeBasedAchievements();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply user preferences on load
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (userPrefs && !prefsApplied.current) {
      prefsApplied.current = true;
      if (userPrefs.default_view && !simulatedRole) {
        setActiveTab(userPrefs.default_view);
      }
      if (userPrefs.default_person_filter) {
        filters.setPersonFilter(userPrefs.default_person_filter);
      }
    }
  }, [userPrefs]);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  const handleOpenSettings = useCallback(() => {
    // Open a settings sheet on mobile — reuse existing settings dialogs
    setSettingsMenuOpen(true);
  }, []);

  const handleMobileProjectTap = useCallback((project: any) => {
    trackRecentOpen(project);
    setMobileDetailProject(project);
    setMobileDetailOpen(true);
  }, [trackRecentOpen]);

  const handleMobileOpenTPV = useCallback((project: any) => {
    setMobileTPVProject(project);
  }, []);

  const handleMobileTPVBack = useCallback(() => {
    setMobileTPVProject(null);
  }, []);

  // TPV data for the mobile TPV list
  const mobileTPVProjectId = mobileTPVProject?.project_id || "";
  const { data: mobileTPVItems = [] } = useTPVItems(mobileTPVProjectId);
  const { statusMap: mobileProductionStatusMap } = useProductionStatuses(mobileTPVProjectId);
  const addTPVItem = useAddTPVItem();
  const mobileTPVCurrency = mobileTPVProject?.currency || "CZK";
  const canManageTPVMobile = !!(role && ["owner", "admin", "pm", "konstrukter"].includes(role));

  return (
    <ColumnVisibilityProvider>
    <ExportProvider>
    <DataLogHighlightProvider>
    <div className={cn("h-screen bg-background flex flex-col overflow-hidden", isMobile && "pb-[72px]")}>
      {/* TEST MODE banner */}
      {profile?.email === "alfred@ami-test.cz" && (
        <div className="bg-orange-500 text-white px-6 flex items-center justify-center gap-2 font-bold tracking-wide shrink-0" style={{ height: 32 }}>
          <span>⚠ TEST MODE — Testovací prostředí — data nejsou produkční</span>
        </div>
      )}
      {/* Role simulation banner */}
      {simulatedRole && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 flex items-center justify-between" style={{ height: 32 }}>
          <span className="text-amber-700 text-sm">Zobrazení jako: <strong>{ROLE_LABELS[simulatedRole] || simulatedRole}</strong></span>
          <button onClick={() => setSimulatedRole(null)} className="text-amber-700 font-medium hover:text-amber-900 underline text-sm">Zpět na Admin</button>
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <MobileHeader
          onDataLog={toggleDataLog}
          showDataLog={canAccessSettings || realRole === "owner" || role === "pm"}
        />
      )}

      {/* Desktop Header */}
      <header className="hidden md:block border-b bg-primary px-6 py-4 shrink-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans">Project Info 2026</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Undo/Redo arrows */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => undo()}
                  disabled={!canUndo()}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canUndo() ? `Zpět: ${lastUndoDescription()}` : "Nic k vrácení"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => redo()}
                  disabled={!canRedo()}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canRedo() ? `Obnovit: ${lastRedoDescription()}` : "Nic k obnovení"}
              </TooltipContent>
            </Tooltip>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1" />

            <button
              onClick={() => navigate("/vyroba")}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Výroba"
            >
              <Factory className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate("/plan-vyroby")}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Plán Výroby"
            >
              <CalendarRange className="h-5 w-5" />
            </button>
            <button
              className="p-2 rounded-md text-primary-foreground bg-primary-foreground/10 transition-colors cursor-default"
              title="Přehled projektů"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>
            {(canAccessSettings || realRole === "owner" || role === "pm") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleDataLog}
                    className={cn(
                      "p-2 rounded-md transition-colors",
                      dataLogOpen
                        ? "text-primary-foreground bg-primary-foreground/10"
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                    title="Data Log"
                  >
                    <Clock className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Data Log</TooltipContent>
              </Tooltip>
            )}
            {canAccessSettings && <AdminInboxButton />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans">{profile?.full_name || profile?.email || "Uživatel"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAccountSettingsOpen(true)}>
                  <UserCog className="h-4 w-4 mr-2" />
                  Nastavení účtu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Odhlásit se
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {(canAccessSettings || realRole === "owner") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                    <Settings className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManageUsers && (
                    <DropdownMenuItem onClick={() => setUserMgmtOpen(true)}>
                      Správa uživatelů
                    </DropdownMenuItem>
                  )}
                  {canManagePeople && (
                    <DropdownMenuItem onClick={openPeopleManagement}>
                      Správa osob
                    </DropdownMenuItem>
                  )}
                  {canManageExchangeRates && (
                    <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                      Kurzovní lístek
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCostPresetsOpen(true)}>
                      Rozpad ceny
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCapacitySettingsOpen(true)}>
                      Kapacita výroby
                    </DropdownMenuItem>
                  )}
                  {canManageStatuses && (
                    <DropdownMenuItem onClick={() => setStatusMgmtOpen(true)}>
                      Správa statusů
                    </DropdownMenuItem>
                  )}
                  {canAccessRecycleBin && (
                    <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>
                      Koš
                    </DropdownMenuItem>
                  )}
                  
                  {realRole === "owner" && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                      {(["admin", "pm", "konstrukter", "viewer"] as const).map((r) => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => setSimulatedRole(r === "admin" ? null : r)}
                          className="flex items-center justify-between"
                        >
                          <span>{ROLE_LABELS[r]}</span>
                          {((r === "admin" && !simulatedRole) || simulatedRole === r) && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Mobile: no top tab bar — switching handled by bottom nav */}

      {/* Desktop: filter bar */}
      <div className="hidden md:block shrink-0 z-40 bg-background border-b px-6 py-3">
        <div>
          <TableFilters
            personFilter={filters.personFilter}
            onPersonFilterChange={filters.setPersonFilter}
            statusFilter={filters.statusFilter}
            onStatusFilterChange={filters.setStatusFilter}
            search={filters.search}
            onSearchChange={filters.setSearch}
            rightSlot={
              <div className="flex items-center gap-2">
                <ExportButton activeTab={activeTab} personFilter={filters.personFilter} statusFilter={filters.statusFilter} />
                {canCreateProject && (
                  <Button size="sm" onClick={() => document.dispatchEvent(new CustomEvent("open-add-project"))}>
                    <Plus className="h-4 w-4 mr-1" /> Nový projekt
                  </Button>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Split layout: main content + data log panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile: Přehled or Projekty */}
        {isMobile ? (
          <main className="flex-1 min-w-0 flex flex-col overflow-y-auto pt-3">
            {mobileTPVProject ? (
              <MobileTPVCardList
                items={mobileTPVItems}
                projectId={mobileTPVProjectId}
                projectName={mobileTPVProject.project_name}
                currency={mobileTPVCurrency}
                productionStatusMap={mobileProductionStatusMap}
                onBack={handleMobileTPVBack}
                onOpenDetail={() => {
                  handleMobileProjectTap(mobileTPVProject);
                }}
                onAddItem={(name) => {
                  addTPVItem.mutate({ project_id: mobileTPVProjectId, item_name: name });
                }}
                onOpenImport={() => {}}
                canManageTPV={canManageTPVMobile}
              />
            ) : mobileTab === "prehled" ? (
              <MobilePrehled
                recentProjects={recentProjects}
                onProjectTap={handleMobileProjectTap}
                onOpenDataLog={toggleDataLog}
              />
            ) : (
              <MobileCardList
                personFilter={filters.personFilter}
                statusFilter={filters.statusFilter}
                search={filters.search}
                riskHighlight={riskHighlight}
                activeTab={activeTab}
                onProjectTap={handleMobileProjectTap}
                onOpenTPV={handleMobileOpenTPV}
              />
            )}
            {mobileDetailProject && (
              <ProjectDetailDialog
                project={mobileDetailProject}
                open={mobileDetailOpen}
                onOpenChange={(open) => {
                  setMobileDetailOpen(open);
                  if (!open) setMobileDetailProject(null);
                }}
                onOpenTPVList={(projectId, projectName) => {
                  setMobileDetailOpen(false);
                  handleMobileOpenTPV(mobileDetailProject);
                }}
                tpvItemCount={0}
              />
            )}
            {/* Mobile DataLog full screen */}
            <DataLogPanel open={dataLogOpen} onOpenChange={(v) => {
              setDataLogOpen(v);
              try { localStorage.setItem("datalog-panel-index", String(v)); } catch {}
            }} />
          </main>
        ) : (
          /* Desktop: table view */
          <main className="px-6 flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className={cn("shrink-0", dashboardCollapsed ? "py-2" : "py-4")}>
              <DashboardStats personFilter={filters.personFilter} statusFilter={filters.statusFilter} riskHighlight={riskHighlight} onRiskHighlightChange={setRiskHighlight} activeTab={activeTab} onCollapsedChange={setDashboardCollapsed} />
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center">
                  <TabsList className="bg-card border">
                    <TabsTrigger value="project-info" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      Project Info
                    </TabsTrigger>
                    <TabsTrigger value="pm-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      PM Status
                    </TabsTrigger>
                    <TabsTrigger value="tpv-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" onClick={() => tpvCloseDetailRef.current?.()}>
                      TPV Status
                    </TabsTrigger>
                    {tpvListActive && activeTab === "tpv-status" && (
                      <>
                        <span className="text-muted-foreground/50 text-xs mx-1 select-none">›</span>
                        <span className="text-xs font-medium text-primary px-2 py-1 rounded-sm bg-primary/10">TPV List</span>
                      </>
                    )}
                  </TabsList>
                  <button
                    onClick={() => {
                      document.dispatchEvent(new CustomEvent("toggle-dashboard"));
                    }}
                    className="ml-4 flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    {dashboardCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    <span>{dashboardCollapsed ? "Zobrazit dashboard" : "Skrýt dashboard"}</span>
                  </button>
                </div>

                <div className="inline-flex h-10 items-center rounded-md bg-card border p-1">
                  {activeTab === "plan" && (
                    <>
                      {(["3M", "6M", "1R"] as ZoomLevel[]).map((z) => (
                        <button
                          key={z}
                          onClick={() => setPlanZoom(z)}
                          className={cn(
                            "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
                            planZoom === z
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {z}
                        </button>
                      ))}
                      <div className="w-px h-4 bg-border mx-1 shrink-0" />
                    </>
                  )}
                  <button
                    onClick={() => handleTabChange("plan")}
                    className={cn(
                      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
                      activeTab === "plan"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    📅 Plán
                  </button>
                </div>
              </div>

              <TabsContent value="project-info" forceMount className={cn("flex-1 min-h-0 overflow-hidden", activeTab !== "project-info" ? "hidden" : "")}>
                <ProjectInfoTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
              </TabsContent>
              <TabsContent value="pm-status" forceMount className={cn("flex-1 min-h-0 overflow-hidden", activeTab !== "pm-status" ? "hidden" : "")}>
                <PMStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
              </TabsContent>
              <TabsContent value="tpv-status" forceMount className={cn("flex-1 min-h-0 overflow-hidden", activeTab !== "tpv-status" ? "hidden" : "")}>
                <TPVStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} onRequestTab={() => handleTabChange("tpv-status")} closeDetailRef={tpvCloseDetailRef} onActiveProjectChange={setTpvListActive} />
              </TabsContent>
              {activeTab === "plan" && (
                <TabsContent value="plan" className="flex-1 min-h-0 overflow-y-auto">
                  <PlanView personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} zoom={planZoom} />
                </TabsContent>
              )}
            </Tabs>
          </main>
        )}

        {/* Data Log Side Panel — desktop only */}
        {!isMobile && (
          <div
            className={cn(
              "transition-all duration-250 ease-in-out overflow-hidden shrink-0",
              dataLogOpen ? "w-[360px]" : "w-0"
            )}
          >
            <DataLogPanel open={dataLogOpen} onOpenChange={(v) => {
              setDataLogOpen(v);
              try { localStorage.setItem("datalog-panel-index", String(v)); } catch {}
            }} />
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      {isMobile && <MobileBottomNav />}

      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      <CostBreakdownPresetsDialog open={costPresetsOpen} onOpenChange={setCostPresetsOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
      
      <AchievementCelebration />
    </div>
    </DataLogHighlightProvider>
    </ExportProvider>
    </ColumnVisibilityProvider>
  );
};

export default Index;
