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
  const { isAdmin, isOwner, canManageUsers, isTestUser } = useAuth();
  const canSeeAdminTabs = isAdmin || isOwner;

  const tabs: ShellTabDef[] = [
    { key: "zamestnanci", label: "Zaměstnanci", visible: canSeeAdminTabs },
    { key: "externisti", label: "Externisté" },
    { key: "uzivatele", label: "Uživatelé", visible: canManageUsers },
    { key: "opravneni", label: "Oprávnění", visible: canSeeAdminTabs },
    { key: "katalog", label: "Pozice & číselníky", visible: canSeeAdminTabs },
    { key: "kapacita", label: "Kapacita", visible: canSeeAdminTabs },
  ];

  const defaultTab = canSeeAdminTabs ? "zamestnanci" : "externisti";

  return (
    <PageTabsShell
      tabs={tabs}
      defaultTab={defaultTab}
      belowTabsSlot={isTestUser ? <div className="px-5 py-2 border-b border-border/60"><TestModeBanner /></div> : null}
    >
      {(active) => (
        <>
          {active === "zamestnanci" && canSeeAdminTabs && <OsobyZamestnanci />}
          {active === "externisti" && <OsobyExternisti />}
          {active === "uzivatele" && canManageUsers && <OsobyUzivatele />}
          {active === "opravneni" && canSeeAdminTabs && <OsobyOpravneni />}
          {active === "katalog" && canSeeAdminTabs && <OsobyKatalog />}
          {active === "kapacita" && canSeeAdminTabs && <OsobyKapacita />}
        </>
      )}
    </PageTabsShell>
  );
}
