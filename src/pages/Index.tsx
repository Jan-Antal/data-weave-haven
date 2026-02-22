import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectInfoTable } from "@/components/ProjectInfoTable";
import { PMStatusTable } from "@/components/PMStatusTable";
import { TPVStatusTable } from "@/components/TPVStatusTable";
import { DashboardStats } from "@/components/DashboardStats";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-primary px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans">Project Info 2026</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <DashboardStats />

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
            <ProjectInfoTable />
          </TabsContent>
          <TabsContent value="pm-status">
            <PMStatusTable />
          </TabsContent>
          <TabsContent value="tpv-status">
            <TPVStatusTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
