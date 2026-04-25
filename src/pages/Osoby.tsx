import { OsobyZamestnanci } from "@/components/osoby/OsobyZamestnanci";
import { OsobyExternisti } from "@/components/osoby/OsobyExternisti";
import { OsobyUzivatele } from "@/components/osoby/OsobyUzivatele";
import { OsobyKatalog } from "@/components/osoby/OsobyKatalog";
import { OsobyKapacita } from "@/components/osoby/OsobyKapacita";
import { OsobyOpravneni } from "@/components/osoby/OsobyOpravneni";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "@/components/TestModeBanner";
import { PageTabsShell, type ShellTabDef } from "@/components/shell/PageTabsShell";

export default function Osoby() {
  const {
    canAccessZamestnanci,
    canAccessExternistiTab,
    canAccessUzivateleTab,
    canAccessOpravneni,
    canAccessKatalog,
    canAccessKapacita,
    isTestUser,
  } = useAuth();

  const tabs: ShellTabDef[] = [
    { key: "zamestnanci", label: "Zaměstnanci", visible: canAccessZamestnanci },
    { key: "externisti", label: "Externisté", visible: canAccessExternistiTab },
    { key: "uzivatele", label: "Uživatelé", visible: canAccessUzivateleTab },
    { key: "opravneni", label: "Oprávnění", visible: canAccessOpravneni },
    { key: "katalog", label: "Pozice & číselníky", visible: canAccessKatalog },
    { key: "kapacita", label: "Kapacita", visible: canAccessKapacita },
  ];

  const firstVisible = tabs.find((t) => t.visible !== false)?.key ?? "zamestnanci";

  return (
    <PageTabsShell
      tabs={tabs}
      defaultTab={firstVisible}
      belowTabsSlot={isTestUser ? <div className="px-5 py-2 border-b border-border/60"><TestModeBanner /></div> : null}
    >
      {(active) => (
        <>
          {active === "zamestnanci" && canAccessZamestnanci && <OsobyZamestnanci />}
          {active === "externisti" && canAccessExternistiTab && <OsobyExternisti />}
          {active === "uzivatele" && canAccessUzivateleTab && <OsobyUzivatele />}
          {active === "opravneni" && canAccessOpravneni && <OsobyOpravneni />}
          {active === "katalog" && canAccessKatalog && <OsobyKatalog />}
          {active === "kapacita" && canAccessKapacita && <OsobyKapacita />}
        </>
      )}
    </PageTabsShell>
  );
}
