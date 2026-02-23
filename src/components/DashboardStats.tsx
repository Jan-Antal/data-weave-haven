import { useMemo, useState, useEffect } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useExchangeRates, getExchangeRate } from "@/hooks/useExchangeRates";
import { parseAppDate } from "@/lib/dateFormat";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const STORAGE_KEY = "dashboard-collapsed";

// Pipeline: status value → display label
const PIPELINE_STAGES: { status: string; label: string }[] = [
  { status: "Příprava", label: "Příprava" },
  { status: "Engineering", label: "Konstrukce" },
  { status: "Výroba IN", label: "Výroba" },
  { status: "Expedice", label: "Expedice" },
  { status: "Montáž", label: "Montáž" },
  { status: "Reklamace", label: "Reklamace" },
];

const EXCLUDED_STATUSES = ["Fakturace", "Dokončeno"];

const PIPELINE_COLORS: Record<string, string> = {
  "Příprava": "#a7d9a2",
  "Konstrukce": "#7cc576",
  "Výroba": "#52b04a",
  "Expedice": "#3a8a36",
  "Montáž": "#256422",
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

interface DashboardStatsProps {
  personFilter?: string | null;
  statusFilter?: string[];
  search?: string;
  riskHighlight: RiskHighlightType;
  onRiskHighlightChange: (v: RiskHighlightType) => void;
}

export function DashboardStats({ personFilter, statusFilter, search, riskHighlight, onRiskHighlightChange }: DashboardStatsProps) {
  const { data: projects = [] } = useProjects();
  const { data: rates = [] } = useExchangeRates();

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

  // Active projects (not Dokončeno/Fakturace)
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
    return PIPELINE_STAGES.map(({ status, label }) => ({
      name: label,
      count: filtered.filter((p) => p.status === status).length,
      fill: PIPELINE_COLORS[label] || "#6b7280",
    }));
  }, [filtered]);

  // Risk & deadlines counts
  const riskCounts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in14 = new Date(now);
    in14.setDate(in14.getDate() + 14);

    let overdue = 0;
    let upcoming = 0;
    let highRisk = 0;

    activeProjects.forEach((p) => {
      if (p.datum_smluvni) {
        const d = parseAppDate(p.datum_smluvni);
        if (d) {
          d.setHours(0, 0, 0, 0);
          if (d < now) overdue++;
          else if (d <= in14) upcoming++;
        }
      }
      if (p.risk === "High") highRisk++;
    });

    return { overdue, upcoming, highRisk };
  }, [activeProjects]);

  const toggleRisk = (type: RiskHighlightType) => {
    onRiskHighlightChange(riskHighlight === type ? null : type);
  };

  const riskRows: { key: RiskHighlightType; color: string; label: string; count: number }[] = [
    { key: "overdue", color: "hsl(0, 70%, 55%)", label: "Po termínu", count: riskCounts.overdue },
    { key: "upcoming", color: "#EA592A", label: "Termín do 14 dní", count: riskCounts.upcoming },
    { key: "high-risk", color: "#EAB308", label: "Vysoké riziko", count: riskCounts.highRisk },
  ];

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
        <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-200" style={{ height: 180 }}>
          {/* Aktivní zakázky + Celková hodnota combined ~20% */}
          <div className="rounded-lg border bg-card p-4 flex flex-col justify-center" style={{ width: "20%", minWidth: 150 }}>
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Aktivní zakázky</p>
              <p className="text-3xl font-serif font-bold mt-0.5">{activeCount}</p>
            </div>
            <div className="border-t border-border my-2" />
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Celková hodnota</p>
              <p className="text-lg font-serif font-bold mt-0.5">{formatNumber(totalValueCZK)} Kč</p>
              <p className="text-[11px] text-muted-foreground">aktivní, v CZK</p>
            </div>
          </div>

          {/* Pipeline ~45% */}
          <div className="rounded-lg border bg-card p-3 flex flex-col min-w-0" style={{ width: "45%" }}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Pipeline zakázek</p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={0}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Riziko & Termíny ~35% */}
          <div className="rounded-lg border bg-card p-4 flex flex-col" style={{ width: "35%", minWidth: 180 }}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Riziko & Termíny</p>
            <div className="flex flex-col gap-2 flex-1 justify-center">
              {riskRows.map(({ key, color, label, count }) => (
                <button
                  key={key}
                  onClick={() => toggleRisk(key)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-md transition-colors text-sm ${
                    riskHighlight === key
                      ? "bg-muted ring-1 ring-border"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-foreground">{label}</span>
                  </span>
                  <span className="font-bold tabular-nums" style={{ color }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
