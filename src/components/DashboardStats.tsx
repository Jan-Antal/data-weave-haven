import { useMemo, useState, useEffect } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useExchangeRates, getExchangeRate } from "@/hooks/useExchangeRates";
import { usePeople } from "@/hooks/usePeople";
import { parseAppDate } from "@/lib/dateFormat";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  LabelList,
  CartesianGrid,
} from "recharts";

const STORAGE_KEY = "dashboard-collapsed";

const PIPELINE_STATUSES = [
  "Příprava",
  "Konstruktér",
  "Výroba",
  "Montáž",
  "Předání",
  "Reklamace",
];

const EXCLUDED_STATUSES = ["Fakturace", "Dokončeno"];

const PIPELINE_COLORS: Record<string, string> = {
  "Příprava": "#a7d9a2",
  "Konstruktér": "#7cc576",
  "Výroba": "#52b04a",
  "Montáž": "#3a8a36",
  "Předání": "#256422",
  "Reklamace": "#EA592A",
};

function getProjectYear(datumSmluvni: string | null): number {
  if (!datumSmluvni) return new Date().getFullYear();
  const d = parseAppDate(datumSmluvni);
  return d ? d.getFullYear() : new Date().getFullYear();
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function getPmBarColor(count: number): string {
  if (count > 12) return "hsl(0, 70%, 55%)";
  if (count > 8) return "#EA592A";
  return "#52b04a";
}

interface DashboardStatsProps {
  personFilter?: string | null;
  statusFilter?: string[];
  search?: string;
}

export function DashboardStats({ personFilter, statusFilter, search }: DashboardStatsProps) {
  const { data: projects = [] } = useProjects();
  const { data: rates = [] } = useExchangeRates();
  const { data: people = [] } = usePeople();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  // Filter projects based on active table filters
  const filtered = useMemo(() => {
    let list = projects;

    if (personFilter) {
      list = list.filter(
        (p) =>
          p.pm === personFilter ||
          p.konstrukter === personFilter ||
          p.kalkulant === personFilter
      );
    }

    if (statusFilter && statusFilter.length > 0) {
      list = list.filter((p) => statusFilter.includes(p.status || ""));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        Object.values(p).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q)
        )
      );
    }

    return list;
  }, [projects, personFilter, statusFilter, search]);

  // Active projects (not Dokončeno, not in trash)
  const activeProjects = useMemo(
    () => filtered.filter((p) => !EXCLUDED_STATUSES.includes(p.status || "")),
    [filtered]
  );

  const activeCount = activeProjects.length;

  const totalValueCZK = useMemo(() => {
    return activeProjects.reduce((sum, p) => {
      const amount = p.prodejni_cena || 0;
      if (amount === 0) return sum;
      const currency = p.currency || "CZK";
      if (currency === "CZK") return sum + amount;
      const year = getProjectYear(p.datum_smluvni);
      const rate = getExchangeRate(rates, year);
      return sum + amount * rate;
    }, 0);
  }, [activeProjects, rates]);

  // Pipeline data
  const pipelineData = useMemo(() => {
    return PIPELINE_STATUSES.map((status) => ({
      name: status,
      count: filtered.filter((p) => p.status === status).length,
      fill: PIPELINE_COLORS[status] || "#6b7280",
    }));
  }, [filtered]);

  // PM workload data
  const pmData = useMemo(() => {
    const counts: Record<string, number> = {};
    activeProjects.forEach((p) => {
      if (p.pm) {
        counts[p.pm] = (counts[p.pm] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeProjects]);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        {collapsed ? "Zobrazit dashboard" : "Skrýt dashboard"}
      </button>

      {!collapsed && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* ROW 1 */}
          <div className="flex gap-4">
            {/* Column 1 — narrow stats */}
            <div className="flex flex-col gap-4 w-[180px] shrink-0">
              <div className="rounded-lg border bg-card p-4 flex-1">
                <p className="text-xs text-muted-foreground">Aktivní zakázky</p>
                <p className="text-3xl font-serif font-bold mt-1">{activeCount}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 flex-1">
                <p className="text-xs text-muted-foreground">Celková hodnota</p>
                <p className="text-lg font-serif font-bold mt-1">
                  {formatNumber(totalValueCZK)} Kč
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">aktivní, v CZK</p>
              </div>
            </div>

            {/* Column 2 — Pipeline chart */}
            <div className="rounded-lg border bg-card p-4 flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-3">Pipeline zakázek</p>
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {pipelineData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ROW 2 — PM workload */}
          {pmData.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-3">Vytížení PM</p>
              <div style={{ height: Math.max(80, pmData.length * 32 + 16) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pmData}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      width={120}
                      tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {pmData.map((entry, i) => (
                        <Cell key={i} fill={getPmBarColor(entry.count)} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
