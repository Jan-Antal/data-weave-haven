import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useExchangeRates, getExchangeRate } from "@/hooks/useExchangeRates";
import { parseAppDate } from "@/lib/dateFormat";
import { matchesStatusFilter } from "@/lib/statusFilter";
import { RiskHighlightType } from "@/hooks/useRiskHighlight";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { getExcludedStatuses } from "@/lib/statusHelpers";
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
const PIPELINE_MODE_KEY = "dashboard-pipeline-mode";
const WORKLOAD_MODE_KEY = "dashboard-workload-mode";

const PIPELINE_STAGES: { statuses: string[]; label: string }[] = [
  { statuses: ["Příprava"], label: "Příprava" },
  { statuses: ["Engineering", "TPV"], label: "Konstrukce" },
  { statuses: ["Výroba IN"], label: "Výroba" },
  { statuses: ["Expedice"], label: "Expedice" },
  { statuses: ["Montáž"], label: "Montáž" },
  { statuses: ["Reklamace"], label: "Reklamace" },
];

// EXCLUDED_STATUSES now derived dynamically from statusOptions

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

export interface DashboardStatsProps {
  personFilter?: string | null;
  statusFilter?: string[];
  riskHighlight: RiskHighlightType;
  onRiskHighlightChange: (v: RiskHighlightType) => void;
  activeTab?: string;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function DashboardStats({ personFilter, statusFilter, riskHighlight, onRiskHighlightChange, activeTab, onCollapsedChange }: DashboardStatsProps) {
  const { data: projects = [] } = useProjects();
  const { data: rates = [] } = useExchangeRates();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const isMobile = useIsMobile();

  const EXCLUDED_STATUSES = useMemo(() => getExcludedStatuses(statusOptions), [statusOptions]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [pipelineMode, setPipelineMode] = useState<"count" | "value">(() => {
    try {
      return (sessionStorage.getItem(PIPELINE_MODE_KEY) as "count" | "value") || "count";
    } catch {
      return "count";
    }
  });

  const [workloadMode, setWorkloadMode] = useState<"count" | "value">(() => {
    try {
      return (sessionStorage.getItem(WORKLOAD_MODE_KEY) as "count" | "value") || "count";
    } catch {
      return "count";
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(collapsed));
      sessionStorage.setItem(PIPELINE_MODE_KEY, pipelineMode);
      sessionStorage.setItem(WORKLOAD_MODE_KEY, workloadMode);
    } catch {}
    onCollapsedChange?.(collapsed);
  }, [collapsed, pipelineMode, workloadMode, onCollapsedChange]);

  // Listen for external toggle events
  useEffect(() => {
    const handler = () => setCollapsed(prev => !prev);
    document.addEventListener("toggle-dashboard", handler);
    return () => document.removeEventListener("toggle-dashboard", handler);
  }, []);

  // Mobile carousel state
  const [mobileCollapsed, setMobileCollapsed] = useState(() => {
    try { return localStorage.getItem("mobile-dashboard-collapsed") === "true"; } catch { return false; }
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const hasInteracted = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const TOTAL_SLIDES = 4;

  // Native scroll-snap: track active slide
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveSlide(((idx % TOTAL_SLIDES) + TOTAL_SLIDES) % TOTAL_SLIDES);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [mobileCollapsed]);

  const scrollToSlide = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }, []);

  // Auto-advance every 8s, stop permanently on first interaction
  useEffect(() => {
    if (hasInteracted.current || mobileCollapsed) return;
    const interval = setInterval(() => {
      if (hasInteracted.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const currentIdx = Math.round(el.scrollLeft / el.clientWidth);
      const nextIdx = (currentIdx + 1) % TOTAL_SLIDES;
      el.scrollTo({ left: nextIdx * el.clientWidth, behavior: "smooth" });
    }, 8000);
    const stopAuto = () => { hasInteracted.current = true; clearInterval(interval); };
    const el = scrollRef.current;
    el?.addEventListener("pointerdown", stopAuto, { once: true });
    return () => { clearInterval(interval); el?.removeEventListener("pointerdown", stopAuto); };
  }, [mobileCollapsed]);

  useEffect(() => {
    try { localStorage.setItem("mobile-dashboard-collapsed", String(mobileCollapsed)); } catch {}
  }, [mobileCollapsed]);

  const filtered = useMemo(() => {
    let list = projects;
    if (personFilter) {
      list = list.filter(
        (p) => p.pm === personFilter || p.konstrukter === personFilter || p.kalkulant === personFilter
      );
    }
    if (statusFilter && statusFilter.length > 0) {
      const allowedStatuses = new Set(statusFilter);
      list = list.filter((p) => matchesStatusFilter(p.status, allowedStatuses));
    }
    return list;
  }, [projects, personFilter, statusFilter]);

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
    return PIPELINE_STAGES.map(({ statuses, label }) => {
      const matching = filtered.filter((p) => statuses.includes(p.status || ""));
      const valueCZK = matching.reduce((sum, p) => {
        const amount = p.prodejni_cena || 0;
        if (amount === 0) return sum;
        const currency = p.currency || "CZK";
        if (currency === "CZK") return sum + amount;
        const year = getProjectYear(p.datum_smluvni);
        const rate = getExchangeRate(rates, year);
        return sum + amount * rate;
      }, 0);
      return {
        name: label,
        count: matching.length,
        value: Math.round(valueCZK / 1000), // in thousands
        fill: PIPELINE_COLORS[label] || "#6b7280",
      };
    });
  }, [filtered, rates]);

  const riskCounts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in14 = new Date(now);
    in14.setDate(in14.getDate() + 14);
    let overdue = 0;
    let upcoming = 0;
    let highRisk = 0;
    const isTPVTab = activeTab === "tpv-status";
    activeProjects.forEach((p) => {
      const dateField = isTPVTab ? (p as any).datum_tpv : p.datum_smluvni;
      if (dateField) {
        const d = parseAppDate(dateField);
        if (d) {
          d.setHours(0, 0, 0, 0);
          if (d < now) overdue++;
          else if (d <= in14) upcoming++;
        }
      }
      const riskField = isTPVTab ? ((p as any).tpv_risk || p.risk) : p.risk;
      if (riskField === "High") highRisk++;
    });
    return { overdue, upcoming, highRisk };
  }, [activeProjects, activeTab]);

  const isTPV = activeTab === "tpv-status";
  const KONSTRUKTER_ACTIVE_STATUSES = ["Příprava", "Engineering", "TPV"];

  // PM / Konstruktér workload data
  const workloadData = useMemo(() => {
    const field = isTPV ? "konstrukter" : "pm";
    const source = isTPV
      ? activeProjects.filter((p) => KONSTRUKTER_ACTIVE_STATUSES.includes(p.status || ""))
      : activeProjects;
    const agg: Record<string, { count: number; valueCZK: number }> = {};
    source.forEach((p) => {
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

  // ── Mobile carousel ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="mb-3">
        <button
          onClick={() => setMobileCollapsed(prev => !prev)}
          className="flex items-center gap-1 text-xs text-muted-foreground mb-2 px-1"
        >
          {mobileCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{mobileCollapsed ? "Zobrazit dashboard" : "Skrýt dashboard"}</span>
        </button>

        {!mobileCollapsed && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <style>{`.mobile-carousel::-webkit-scrollbar { display: none; }`}</style>
            <div
              ref={scrollRef}
              className="mobile-carousel flex overflow-x-auto snap-x snap-mandatory"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
            >
                {/* Card 1: Aktivní zakázky */}
                <div className="flex-shrink-0 w-full snap-start px-1">
                  <div className="rounded-lg border bg-card p-4 h-[160px] flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Aktivní zakázky</p>
                    <span className="font-serif font-bold text-3xl mt-1">{activeCount}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">ø {activeCount > 0 ? formatNumber(Math.round(totalValueCZK / activeCount)) : "—"} Kč</p>
                    <div className="my-2 border-t border-border" />
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Celková hodnota</p>
                    <p className="font-serif font-bold text-xl mt-0.5">{formatNumber(totalValueCZK)} Kč</p>
                  </div>
                </div>

                {/* Card 2: Pipeline */}
                <div className="flex-shrink-0 w-full snap-start px-1">
                  <div className="rounded-lg border bg-card p-3 h-[160px] flex flex-col">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pipeline zakázek</p>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pipelineData} margin={{ top: 16, right: 2, left: 2, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#999" }} interval={0} />
                          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
                            {pipelineData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                            <LabelList dataKey="count" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "hsl(var(--foreground))" }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Card 3: Riziko & Termíny */}
                <div className="flex-shrink-0 w-full snap-start px-1">
                  <div className="rounded-lg border bg-card p-4 h-[160px] flex flex-col">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Riziko & Termíny</p>
                    <div className="flex flex-col gap-1">
                      {riskRows.map(({ key, color, label, count }) => (
                        <button
                          key={key}
                          onClick={() => toggleRisk(key)}
                          className={`flex items-center justify-between px-2.5 rounded-md transition-colors min-h-[36px] ${
                            riskHighlight === key ? "ring-1 ring-border bg-muted" : ""
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-block rounded-full" style={{ width: 8, height: 8, backgroundColor: color }} />
                            <span className="text-sm text-foreground">{label}</span>
                          </span>
                          <span className="font-bold tabular-nums text-lg" style={{ color }}>{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card 4: Vytížení PM */}
                <div className="flex-shrink-0 w-full snap-start px-1">
                  <div className="rounded-lg border bg-card p-3 h-[160px] flex flex-col">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{isTPV ? "Vytížení Konstruktér" : "Vytížení PM"}</p>
                    <div className="flex-1 flex items-center gap-2 min-h-0">
                      <div className="relative" style={{ width: 90, height: 90, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={workloadData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={24} outerRadius={40} paddingAngle={2} strokeWidth={0}>
                              {workloadData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="font-serif font-bold text-lg">{workloadData.reduce((s, d) => s + d.value, 0)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                        {workloadData.slice(0, 6).map((entry) => (
                          <div key={entry.name} className="flex items-center gap-1.5 whitespace-nowrap text-[11px]">
                            <span className="inline-block rounded-full shrink-0" style={{ width: 6, height: 6, backgroundColor: entry.fill }} />
                            <span className="text-muted-foreground truncate" style={{ maxWidth: 80 }}>{entry.name}</span>
                            <span className="font-bold text-foreground">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
            </div>

          </div>
        )}
      </div>
    );
  }

  // ── Desktop rendering ─────────────────────────────────────────────
  return (
    <div>

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
              <p className="font-serif font-bold mt-1 whitespace-nowrap" style={{ fontSize: "clamp(18px, 2vw, 28px)" }}>{formatNumber(totalValueCZK)} Kč</p>
              <p style={{ fontSize: 10, color: "#aaa" }} className="mt-0.5">aktivní, v CZK</p>
            </div>
          </div>

          {/* Card 2: Pipeline */}
          <div className="rounded-lg border bg-card p-3 flex flex-col min-w-0" style={{ width: "35%" }}>
            <div className="flex items-center justify-between mb-1">
              <p style={{ fontSize: 10 }} className="uppercase tracking-wider text-muted-foreground">Pipeline zakázek</p>
              <div className="flex flex-col items-end gap-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPipelineMode("count")}
                    className={`text-[9px] transition-colors ${
                      pipelineMode === "count" ? "text-foreground font-semibold" : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  >
                    #
                  </button>
                  <span className="text-muted-foreground/30 text-[9px]">/</span>
                  <button
                    onClick={() => setPipelineMode("value")}
                    className={`text-[9px] transition-colors ${
                      pipelineMode === "value" ? "text-foreground font-semibold" : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  >
                    Kč
                  </button>
                </div>
                {pipelineMode === "value" && (
                  <p style={{ fontSize: 8 }} className="text-muted-foreground/50">v tis. Kč</p>
                )}
              </div>
            </div>
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
                  <Bar dataKey={pipelineMode === "count" ? "count" : "value"} radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {pipelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey={pipelineMode === "count" ? "count" : "value"}
                      position="top"
                      formatter={(v: number) => pipelineMode === "value" ? `${formatNumber(v)}` : v}
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
            <div className="flex items-center justify-between mb-1">
              <p style={{ fontSize: 10 }} className="uppercase tracking-wider text-muted-foreground">{isTPV ? "Vytížení Konstruktér" : "Vytížení PM"}</p>
              <div className="flex flex-col items-end gap-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWorkloadMode("count")}
                    className={`text-[9px] transition-colors ${
                      workloadMode === "count" ? "text-foreground font-semibold" : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  >
                    #
                  </button>
                  <span className="text-muted-foreground/30 text-[9px]">/</span>
                  <button
                    onClick={() => setWorkloadMode("value")}
                    className={`text-[9px] transition-colors ${
                      workloadMode === "value" ? "text-foreground font-semibold" : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  >
                    Kč
                  </button>
                </div>
                {workloadMode === "value" && (
                  <p style={{ fontSize: 8 }} className="text-muted-foreground/50">v tis. Kč</p>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center gap-2">
              {/* Donut */}
              <div className="relative" style={{ width: 110, height: 110, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={workloadData}
                      dataKey={workloadMode === "count" ? "value" : "valueCZK"}
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
                {/* Center count/value */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {workloadMode === "count" ? (
                    <span className="font-serif font-bold" style={{ fontSize: 20 }}>{workloadData.reduce((s, d) => s + d.value, 0)}</span>
                  ) : (
                    <>
                      <span className="font-serif font-bold leading-tight" style={{ fontSize: 14 }}>
                        {formatNumber(Math.round(workloadData.reduce((s, d) => s + d.valueCZK, 0) / 1000))}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: 8 }}>tis. Kč</span>
                    </>
                  )}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                {workloadData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 11 }}>
                    <span className="inline-block rounded-full shrink-0" style={{ width: 7, height: 7, backgroundColor: entry.fill }} />
                    <span className="text-muted-foreground truncate" style={{ maxWidth: 90 }}>{entry.name}</span>
                    {workloadMode === "count" ? (
                      <span className="font-bold text-foreground">{entry.value}</span>
                    ) : (
                      <span className="font-bold text-foreground">
                        {entry.valueCZK > 0 ? `${formatNumber(Math.round(entry.valueCZK / 1000))}` : "—"}
                      </span>
                    )}
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
