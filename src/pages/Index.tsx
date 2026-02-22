import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
import { PMStatusTable } from "@/components/PMStatusTable";
import { TPVStatusTable } from "@/components/TPVStatusTable";
import { DashboardStats } from "@/components/DashboardStats";
import { TableFilters, useTableFilters } from "@/components/TableFilters";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings } from "lucide-react";
import { usePeopleManagement } from "@/components/PeopleManagementContext";

const Index = () => {
  const filters = useTableFilters();
  const { openPeopleManagement } = usePeopleManagement();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary px-6 py-4">
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
              <DropdownMenuSeparator />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <DashboardStats />

        <TableFilters
          personFilter={filters.personFilter}
          onPersonFilterChange={filters.setPersonFilter}
          statusFilter={filters.statusFilter}
          onStatusFilterChange={filters.setStatusFilter}
        />

        <Tabs defaultValue="project-info" className="space-y-4">
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
            <ProjectInfoTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} />
          </TabsContent>
          <TabsContent value="pm-status">
            <PMStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} />
          </TabsContent>
          <TabsContent value="tpv-status">
            <TPVStatusTable personFilter={filters.personFilter} statusFilter={filters.statusFilter} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
