import { useProjects } from "@/hooks/useProjects";
import { useExchangeRates, getExchangeRate } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/lib/currency";
import { parseAppDate } from "@/lib/dateFormat";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-serif font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function getProjectYear(datumSmluvni: string | null): number {
  if (!datumSmluvni) return new Date().getFullYear();
  const d = parseAppDate(datumSmluvni);
  return d ? d.getFullYear() : new Date().getFullYear();
}

export function DashboardStats() {
  const { data: projects = [] } = useProjects();
  const { data: rates = [] } = useExchangeRates();

  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => !["Dokončeno", "Fakturace"].includes(p.status || "")).length;

  const totalValueCZK = projects.reduce((sum, p) => {
    const amount = p.prodejni_cena || 0;
    if (amount === 0) return sum;
    const currency = p.currency || "CZK";
    if (currency === "CZK") return sum + amount;
    // Convert EUR to CZK using exchange rate for the project year
    const year = getProjectYear(p.datum_smluvni);
    const rate = getExchangeRate(rates, year);
    return sum + amount * rate;
  }, 0);

  const highRisk = projects.filter(p => p.risk === "High").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Celkem zakázek" value={totalProjects.toString()} />
      <StatCard label="Aktivní zakázky" value={activeProjects.toString()} />
      <StatCard
        label="Celková hodnota"
        value={formatCurrency(totalValueCZK, "CZK")}
        sub="přepočteno na CZK"
      />
      <StatCard label="Vysoké riziko" value={highRisk.toString()} sub={highRisk > 0 ? "vyžaduje pozornost" : "vše v pořádku"} />
    </div>
  );
}
