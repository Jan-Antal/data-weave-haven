import { PageTabsShell, type ShellTabDef } from "@/components/shell/PageTabsShell";
import { TpvSummaryTab } from "@/components/tpv/TpvSummaryTab";
import { TpvMaterialTab } from "@/components/tpv/TpvMaterialTab";
import { TpvHoursTab } from "@/components/tpv/TpvHoursTab";
import { useAuth } from "@/hooks/useAuth";

export default function Tpv() {
  const { canViewTpvPrehlad, canViewTpvMaterial, canViewTpvHodinovaDotacia } = useAuth();
  const TABS: ShellTabDef[] = [
    { key: "summary", label: "Prehľad pipeline", visible: canViewTpvPrehlad },
    { key: "material", label: "Materiál", visible: canViewTpvMaterial },
    { key: "hodiny", label: "Hodinová dotácia", visible: canViewTpvHodinovaDotacia },
  ];
  const first = TABS.find((t) => t.visible !== false)?.key ?? "summary";

  return (
    <PageTabsShell tabs={TABS} defaultTab={first}>
      {(active) => {
        if (active === "material" && canViewTpvMaterial) return <TpvMaterialTab />;
        if (active === "hodiny" && canViewTpvHodinovaDotacia) return <TpvHoursTab />;
        if (active === "summary" && canViewTpvPrehlad) return <TpvSummaryTab />;
        return null;
      }}
    </PageTabsShell>
  );
}
