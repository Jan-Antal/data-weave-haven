import { useNavigate } from "react-router-dom";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { ArrowLeft, Settings } from "lucide-react";

export function ProductionHeader() {
  const navigate = useNavigate();
  const { data: settings } = useProductionSettings();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();

  const monthlyHours = settings?.monthly_capacity_hours ?? 3500;
  const hourlyRate = settings?.hourly_rate ?? 550;
  const monthlyCzk = monthlyHours * hourlyRate;

  const scheduledHours = scheduleData
    ? Array.from(scheduleData.values()).reduce((s, w) => s + w.total_hours, 0)
    : 0;

  const inboxHours = inboxProjects.reduce((s, p) => s + p.total_hours, 0);
  const isOverCapacity = scheduledHours > monthlyHours;

  const formatCzk = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
    return `${v.toLocaleString("cs-CZ")} Kč`;
  };

  return (
    <header className="border-b bg-primary px-6 py-2.5 shrink-0">
      <div className="flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
            A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
          </h1>
          <span className="text-primary-foreground/30 text-sm">|</span>
          <span className="text-primary-foreground/70 text-sm font-sans font-medium">Plán Výroby</span>
        </div>

        {/* Center: Stats */}
        <div className="flex items-center gap-0">
          <StatBox label="Kapacita / měsíc" value={`${monthlyHours.toLocaleString("cs-CZ")} h`} />
          <Divider />
          <StatBox label="CZK ekvivalent" value={formatCzk(monthlyCzk)} />
          <Divider />
          <StatBox
            label="Naplánováno"
            value={`${Math.round(scheduledHours).toLocaleString("cs-CZ")} h`}
            valueColor={isOverCapacity ? "#fca5a5" : "#a7d9a2"}
          />
          <Divider />
          <StatBox
            label="V Inboxu"
            value={`${Math.round(inboxHours).toLocaleString("cs-CZ")} h`}
            valueColor="#fcd34d"
          />
        </div>

        {/* Right: Settings + Back */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="flex items-center gap-1.5 text-primary-foreground/50 text-xs">
            <Settings className="h-3 w-3" />
            <span className="font-mono text-[10px]">Sazba: {hourlyRate} Kč/h</span>
          </span>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět
          </button>
        </div>
      </div>
    </header>
  );
}

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="px-3.5 text-center">
      <div className="text-[8px] uppercase tracking-[0.08em] font-medium text-primary-foreground/40">
        {label}
      </div>
      <div
        className="font-mono font-semibold text-[13px] leading-tight"
        style={{ color: valueColor || "rgba(255,255,255,0.9)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-primary-foreground/15" />;
}
