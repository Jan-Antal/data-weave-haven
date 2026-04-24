import { PageTabsShell, type ShellTabDef } from "@/components/shell/PageTabsShell";
import { TpvSummaryTab } from "@/components/tpv/TpvSummaryTab";
import { TpvMaterialTab } from "@/components/tpv/TpvMaterialTab";
import { TpvHoursTab } from "@/components/tpv/TpvHoursTab";

const TABS: ShellTabDef[] = [
  { key: "summary", label: "Prehľad pipeline" },
  { key: "material", label: "Materiál" },
  { key: "hodiny", label: "Hodinová dotácia" },
];

export default function Tpv() {
  return (
    <PageTabsShell tabs={TABS} defaultTab="summary">
      {(active) => {
        if (active === "material") return <TpvMaterialTab />;
        if (active === "hodiny") return <TpvHoursTab />;
        return <TpvSummaryTab />;
      }}
    </PageTabsShell>
  );
}
