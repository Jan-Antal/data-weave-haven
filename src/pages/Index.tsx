import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
import { PMStatusTable } from "@/components/PMStatusTable";
import { TPVStatusTable } from "@/components/TPVStatusTable";
import { DashboardStats } from "@/components/DashboardStats";
import { TableFilters, useTableFilters } from "@/components/TableFilters";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings, Plus } from "lucide-react";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useState } from "react";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { TPVStatusSettings } from "@/components/TPVStatusSettings";
import { RecycleBin } from "@/components/RecycleBin";
import { Button } from "@/components/ui/button";

const Index = () => {
  const filters = useTableFilters();
  const { openPeopleManagement } = usePeopleManagement();
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [tpvStatusOpen, setTPVStatusOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("project-info");
  return (
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                <Settings className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openPeopleManagement}>
                Správa osob
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                Kurzovní lístek
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTPVStatusOpen(true)}>
                Správa TPV statusů
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>
                Koš
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </DropdownMenuContent>
          </DropdownMenu>
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
              activeTab === "project-info" ? (
                <Button size="sm" onClick={() => document.dispatchEvent(new CustomEvent("open-add-project"))}>
                  <Plus className="h-4 w-4 mr-1" /> Nový projekt
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6 flex-1">
        <DashboardStats />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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

          <TabsContent value="project-info">
            <ProjectInfoTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} />
          </TabsContent>
          <TabsContent value="pm-status">
            <PMStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} />
          </TabsContent>
          <TabsContent value="tpv-status">
            <TPVStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} search={filters.search} />
          </TabsContent>
        </Tabs>
      </main>

      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <TPVStatusSettings open={tpvStatusOpen} onOpenChange={setTPVStatusOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <TPVStatusSettings open={tpvStatusOpen} onOpenChange={setTPVStatusOpen} />
    </div>
  );
};

export default Index;
