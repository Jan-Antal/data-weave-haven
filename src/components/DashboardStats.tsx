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
  PieChart,
  Pie,
} from "recharts";

const STORAGE_KEY = "dashboard-collapsed";

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

const PM_GREENS = [
  "#1a3a1a", "#256422", "#2d7a2d", "#3a8a36", "#48a344",
  "#52b04a", "#6bc462", "#7cc576", "#93d48e", "#a7d9a2",
  "#bce6b8", "#d4f0d0",
];

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
  activeTab?: string;
}

export function DashboardStats({ personFilter, statusFilter, search, riskHighlight, onRiskHighlightChange, activeTab }: DashboardStatsProps) {
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

  const filtered = useMemo(() => {
    let list = projects;
    if (personFilter) {
      list = list.filter(
        (p) => p.pm === personFilter || p.konstrukter === personFilter || p.kalkulant === personFilter
      );
    }
    if (statusFilter && statusFilter.length > 0) {
      list = list.filter((p) => statusFilter.includes(p.status || ""));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        Object.values(p).some((v) => typeof v === "string" && v.toLowerCase().includes(q))
      );
    }
    return list;
  }, [projects, personFilter, statusFilter, search]);

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

  const pipelineData = useMemo(() => {
    return PIPELINE_STAGES.map(({ status, label }) => ({
      name: label,
      count: filtered.filter((p) => p.status === status).length,
      fill: PIPELINE_COLORS[label] || "#6b7280",
    }));
  }, [filtered]);

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

  const isTPV = activeTab === "tpv-status";

  // PM / Konstruktér workload data
  const workloadData = useMemo(() => {
    const field = isTPV ? "konstrukter" : "pm";
    const agg: Record<string, { count: number; valueCZK: number }> = {};
    activeProjects.forEach((p) => {
      const person = (p as any)[field] || "Nepřiřazeno";
      if (!agg[person]) agg[person] = { count: 0, valueCZK: 0 };
      agg[person].count += 1;
      const amount = p.prodejni_cena || 0;
      if (amount > 0) {
        const currency = p.currency || "CZK";
        if (currency === "CZK") {
          agg[person].valueCZK += amount;
        } else {
          const year = getProjectYear(p.datum_smluvni);
          const rate = getExchangeRate(rates, year);
          agg[person].valueCZK += amount * rate;
        }
      }
    });
    const sorted = Object.entries(agg)
      .map(([name, { count, valueCZK }]) => ({ name, value: count, valueCZK }))
      .sort((a, b) => b.value - a.value);
    return sorted.map((entry, i) => ({
      ...entry,
      fill: PM_GREENS[i % PM_GREENS.length],
    }));
  }, [activeProjects, rates, isTPV]);

  const toggleRisk = (type: RiskHighlightType) => {
    onRiskHighlightChange(riskHighlight === type ? null : type);
  };

  const riskRows: { key: RiskHighlightType; color: string; bgTint: string; label: string; count: number }[] = [
    { key: "overdue", color: "hsl(0, 70%, 55%)", bgTint: "hsla(0, 70%, 55%, 0.06)", label: "Po termínu", count: riskCounts.overdue },
    { key: "upcoming", color: "#EA592A", bgTint: "transparent", label: "Termín do 14 dní", count: riskCounts.upcoming },
    { key: "high-risk", color: "#EAB308", bgTint: "transparent", label: "Vysoké riziko", count: riskCounts.highRisk },
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
        <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-200" style={{ height: 190 }}>
          {/* Card 1: Aktivní zakázky + Celková hodnota */}
          <div className="rounded-lg border bg-card py-5 px-5 flex flex-col justify-center" style={{ width: "18%", minWidth: 140 }}>
            <div className="flex-1 flex flex-col justify-center">
              <p style={{ fontSize: 10 }} className="uppercase tracking-wider" >
                <span style={{ color: "#999" }}>Aktivní zakázky</span>
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-serif font-bold leading-none" style={{ fontSize: 28 }}>{activeCount}</span>
                <span style={{ fontSize: 13, color: "#999" }}>ø {activeCount > 0 ? formatNumber(Math.round(totalValueCZK / activeCount)) : "—"} Kč</span>
              </div>
            </div>
            <div className="my-3" style={{ borderTop: "1px solid #f0ede8" }} />
            <div className="flex-1 flex flex-col justify-center">
              <p style={{ fontSize: 10 }} className="uppercase tracking-wider">
                <span style={{ color: "#999" }}>Celková hodnota</span>
              </p>
              <p className="font-serif font-bold mt-1" style={{ fontSize: 28 }}>{formatNumber(totalValueCZK)} Kč</p>
              <p style={{ fontSize: 10, color: "#aaa" }} className="mt-0.5">aktivní, v CZK</p>
            </div>
          </div>

          {/* Card 2: Pipeline */}
          <div className="rounded-lg border bg-card p-3 flex flex-col min-w-0" style={{ width: "35%" }}>
            <p style={{ fontSize: 10, color: "#999" }} className="uppercase tracking-wider mb-1">Pipeline zakázek</p>
            <div className="flex-1 min-h-0 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#999" }}
                    interval={0}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 3: Riziko & Termíny */}
          <div className="rounded-lg border bg-card px-4 py-3 flex flex-col" style={{ width: "22%", minWidth: 160 }}>
            <p style={{ fontSize: 10, color: "#999" }} className="uppercase tracking-wider mb-2">Riziko & Termíny</p>
            <div className="flex flex-col gap-0.5">
              {riskRows.map(({ key, color, bgTint, label, count }) => (
                <button
                  key={key}
                  onClick={() => toggleRisk(key)}
                  className={`flex items-center justify-between px-2.5 rounded-md transition-colors ${
                    riskHighlight === key ? "ring-1 ring-border" : ""
                  }`}
                  style={{
                    height: 36,
                    backgroundColor: riskHighlight === key ? "hsl(var(--muted))" : bgTint,
                  }}
                  onMouseEnter={(e) => {
                    if (riskHighlight !== key) e.currentTarget.style.backgroundColor = "#f9f7f4";
                  }}
                  onMouseLeave={(e) => {
                    if (riskHighlight !== key) e.currentTarget.style.backgroundColor = bgTint;
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full shrink-0"
                      style={{ width: 8, height: 8, backgroundColor: color }}
                    />
                    <span style={{ fontSize: 13 }} className="text-foreground">{label}</span>
                  </span>
                  <span className="font-bold tabular-nums" style={{ fontSize: 18, color }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Card 4: Vytížení PM / Konstruktér */}
          <div className="rounded-lg border bg-card px-4 py-3 flex flex-col" style={{ width: "25%", minWidth: 180 }}>
            <p style={{ fontSize: 10, color: "#999" }} className="uppercase tracking-wider mb-1">{isTPV ? "Vytížení Konstruktér" : "Vytížení PM"}</p>
            <div className="flex-1 min-h-0 flex items-center gap-2">
              {/* Donut */}
              <div className="relative" style={{ width: 110, height: 110, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={workloadData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {workloadData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center count */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="font-serif font-bold" style={{ fontSize: 20 }}>{activeCount}</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                {workloadData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 11 }}>
                    <span className="inline-block rounded-full shrink-0" style={{ width: 7, height: 7, backgroundColor: entry.fill }} />
                    <span className="text-muted-foreground truncate" style={{ maxWidth: 90 }}>{entry.name}</span>
                    <span className="font-bold text-foreground">{entry.value}</span>
                    <span className="text-muted-foreground" style={{ fontSize: 10 }}>|</span>
                    <span className="font-bold text-foreground">
                      {entry.valueCZK > 0 ? `${formatNumber(entry.valueCZK)} Kč` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
