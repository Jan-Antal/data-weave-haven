import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
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
import { Settings, Plus, LogOut, User, Check } from "lucide-react";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AdminInboxButton } from "@/components/AdminInbox";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useState, useRef, useCallback, useEffect } from "react";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { UserManagement } from "@/components/UserManagement";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

const Index = () => {
  const filters = useTableFilters();
  const { openPeopleManagement } = usePeopleManagement();
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("project-info");
  const [riskHighlight, setRiskHighlight] = useState<RiskHighlightType>(null);
  const [savedStatusFilter, setSavedStatusFilter] = useState<string[] | null>(null);
  const [planZoom, setPlanZoom] = useState<ZoomLevel>("3M");
  const tpvCloseDetailRef = useRef<(() => void) | null>(null);

  const TPV_ACTIVE_STATUSES = ["Příprava", "Engineering", "TPV"];

  const handleTabChange = (tab: string) => {
    // Close any open TPV detail view on any tab switch
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
    setActiveTab(tab);
  };
  const { profile, signOut, canAccessSettings, canCreateProject, isAdmin, isOwner, realRole, simulatedRole, setSimulatedRole, role, isKonstrukter } = useAuth();

  // Auto-switch to allowed tab when role changes
  useEffect(() => {
    if (isKonstrukter && activeTab !== "tpv-status" && activeTab !== "plan") {
      setActiveTab("tpv-status");
    }
  }, [isKonstrukter, activeTab]);

  return (
    <ColumnVisibilityProvider>
    <ExportProvider>
    <div className="min-h-screen bg-background flex flex-col">
      {/* Role simulation banner */}
      {simulatedRole && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 flex items-center justify-between" style={{ height: 32 }}>
          <span className="text-amber-700 text-sm">Zobrazení jako: <strong>{ROLE_LABELS[simulatedRole] || simulatedRole}</strong></span>
          <button onClick={() => setSimulatedRole(null)} className="text-amber-700 font-medium hover:text-amber-900 underline text-sm">Zpět na Admin</button>
        </div>
      )}
      <header className="border-b bg-primary px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans">Project Info 2026</span>
          </div>
          <div className="flex items-center gap-1">
            {canAccessSettings && <AdminInboxButton />}
            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans">{profile?.full_name || profile?.email || "Uživatel"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Odhlásit se
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Role switcher - owner only */}
            {realRole === "owner" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm font-sans">
                    {ROLE_LABELS[role || "admin"] || "Admin"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                  <DropdownMenuSeparator />
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Settings gear - admin only */}
            {canAccessSettings && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                    <Settings className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setUserMgmtOpen(true)}>
                    Správa uživatelů
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openPeopleManagement}>
                    Správa osob
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                    Kurzovní lístek
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusMgmtOpen(true)}>
                    Správa statusů
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>
                    Koš
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="sticky top-[65px] z-40 bg-background border-b px-6 py-3">
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
                <ExportButton activeTab={activeTab} />
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

      <main className="px-6 py-6 space-y-6 flex-1 w-full">
        <DashboardStats personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} onRiskHighlightChange={setRiskHighlight} activeTab={activeTab} />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList className="bg-card border">
              {!isKonstrukter && (
                <TabsTrigger value="project-info" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Project Info
                </TabsTrigger>
              )}
              {!isKonstrukter && (
                <TabsTrigger value="pm-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  PM Status
                </TabsTrigger>
              )}
              <TabsTrigger value="tpv-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" onClick={() => tpvCloseDetailRef.current?.()}>
                TPV Status
              </TabsTrigger>
            </TabsList>

            {/* Plán + Zoom unified tile */}
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

          <TabsContent value="project-info" forceMount className={activeTab !== "project-info" ? "hidden" : ""}>
            <ProjectInfoTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
          </TabsContent>
          <TabsContent value="pm-status" forceMount className={activeTab !== "pm-status" ? "hidden" : ""}>
            <PMStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
          </TabsContent>
          <TabsContent value="tpv-status" forceMount className={activeTab !== "tpv-status" ? "hidden" : ""}>
            <TPVStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} onRequestTab={() => handleTabChange("tpv-status")} closeDetailRef={tpvCloseDetailRef} />
          </TabsContent>
          <TabsContent value="plan" forceMount className={activeTab !== "plan" ? "hidden" : ""}>
            <PlanView personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} zoom={planZoom} />
          </TabsContent>
        </Tabs>
      </main>

      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      {canAccessSettings && <FeedbackWidget />}
    </div>
    </ExportProvider>
    </ColumnVisibilityProvider>
  );
};

export default Index;
