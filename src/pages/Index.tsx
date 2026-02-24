import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
import { PMStatusTable } from "@/components/PMStatusTable";
import { TPVStatusTable } from "@/components/TPVStatusTable";
import { ColumnVisibilityProvider } from "@/components/ColumnVisibilityContext";
import { DashboardStats } from "@/components/DashboardStats";
import { TableFilters, useTableFilters } from "@/components/TableFilters";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings, Plus, LogOut, User } from "lucide-react";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useState } from "react";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { UserManagement } from "@/components/UserManagement";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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

  const TPV_ACTIVE_STATUSES = ["Příprava", "Engineering", "TPV"];

  const handleTabChange = (tab: string) => {
    if (tab === "tpv-status" && activeTab !== "tpv-status") {
      // Entering TPV tab: save current filter, apply TPV filter
      setSavedStatusFilter(filters.statusFilter);
      filters.setStatusFilter(TPV_ACTIVE_STATUSES);
    } else if (tab !== "tpv-status" && activeTab === "tpv-status") {
      // Leaving TPV tab: restore saved filter
      if (savedStatusFilter !== null) {
        filters.setStatusFilter(savedStatusFilter);
        setSavedStatusFilter(null);
      }
    }
    setActiveTab(tab);
  };
  const { profile, signOut, canAccessSettings, canCreateProject, isAdmin } = useAuth();

  return (
    <ColumnVisibilityProvider>
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-primary px-6 py-4 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans">Project Info 2026</span>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="max-w-[1600px] mx-auto">
          <TableFilters
            personFilter={filters.personFilter}
            onPersonFilterChange={filters.setPersonFilter}
            statusFilter={filters.statusFilter}
            onStatusFilterChange={filters.setStatusFilter}
            search={filters.search}
            onSearchChange={filters.setSearch}
            rightSlot={
              canCreateProject ? (
                <Button size="sm" onClick={() => document.dispatchEvent(new CustomEvent("open-add-project"))}>
                  <Plus className="h-4 w-4 mr-1" /> Nový projekt
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6 flex-1">
        <DashboardStats personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} onRiskHighlightChange={setRiskHighlight} activeTab={activeTab} />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="bg-card border">
            <TabsTrigger value="project-info" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Project Info
            </TabsTrigger>
            <TabsTrigger value="pm-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              PM Status
            </TabsTrigger>
            <TabsTrigger value="tpv-status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              TPV Status
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project-info" forceMount className={activeTab !== "project-info" ? "hidden" : ""}>
            <ProjectInfoTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
          </TabsContent>
          <TabsContent value="pm-status" forceMount className={activeTab !== "pm-status" ? "hidden" : ""}>
            <PMStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
          </TabsContent>
          <TabsContent value="tpv-status" forceMount className={activeTab !== "tpv-status" ? "hidden" : ""}>
            <TPVStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} riskHighlight={riskHighlight} />
          </TabsContent>
        </Tabs>
      </main>

      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
    </div>
    </ColumnVisibilityProvider>
  );
};

export default Index;
