import { projectInfoData, pmStatusData } from "@/data/projects";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-serif font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardStats() {
  const totalProjects = projectInfoData.length;
  const activeProjects = projectInfoData.filter(p => !["Dokončeno", "Fakturace"].includes(p.status)).length;
  const totalValue = projectInfoData.reduce((sum, p) => sum + (p.currency === "CZK" ? p.prodejniCena : p.prodejniCena * 25), 0);
  const highRisk = pmStatusData.filter(p => p.riskLevel === "High").length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Celkem zakázek" value={totalProjects.toString()} />
      <StatCard label="Aktivní zakázky" value={activeProjects.toString()} />
      <StatCard 
        label="Celková hodnota" 
        value={new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(totalValue)} 
        sub="přepočteno na CZK"
      />
      <StatCard label="Vysoké riziko" value={highRisk.toString()} sub={highRisk > 0 ? "vyžaduje pozornost" : "vše v pořádku"} />
    </div>
  );
}
