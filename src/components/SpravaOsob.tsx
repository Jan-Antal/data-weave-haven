import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "./TestModeBanner";
import { OsobyZamestnanci } from "./osoby/OsobyZamestnanci";
import { OsobyExternisti } from "./osoby/OsobyExternisti";
import { OsobyUzivatele } from "./osoby/OsobyUzivatele";
import { OsobyKatalog } from "./osoby/OsobyKatalog";
import { OsobyKapacita } from "./osoby/OsobyKapacita";

export type SpravaOsobTab = "zamestnanci" | "externisti" | "uzivatele" | "katalog" | "kapacita";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: SpravaOsobTab;
}

export function SpravaOsob({ open, onOpenChange, defaultTab = "zamestnanci" }: Props) {
  const { isAdmin, isOwner, canManageUsers, isTestUser } = useAuth();
  const canSeeAdminTabs = isAdmin || isOwner;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogHeader>
            <DialogTitle>Správa osob</DialogTitle>
          </DialogHeader>
          {isTestUser && <div className="mt-2"><TestModeBanner /></div>}
        </div>

        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 self-start">
            <TabsTrigger value="zamestnanci">Zaměstnanci</TabsTrigger>
            <TabsTrigger value="externisti">Externisti</TabsTrigger>
            {canManageUsers && <TabsTrigger value="uzivatele">Uživatelé</TabsTrigger>}
            {canSeeAdminTabs && <TabsTrigger value="katalog">Pozice & číselníky</TabsTrigger>}
            {canSeeAdminTabs && <TabsTrigger value="kapacita">Kapacita</TabsTrigger>}
          </TabsList>

          <TabsContent value="zamestnanci" className="flex-1 overflow-hidden mt-3 pt-2">
            <OsobyZamestnanci />
          </TabsContent>
          <TabsContent value="externisti" className="flex-1 overflow-hidden mt-3 pt-2">
            <OsobyExternisti />
          </TabsContent>
          {canManageUsers && (
            <TabsContent value="uzivatele" className="flex-1 overflow-hidden mt-3 pt-2">
              <OsobyUzivatele />
            </TabsContent>
          )}
          {canSeeAdminTabs && (
            <TabsContent value="katalog" className="flex-1 overflow-hidden mt-3 pt-2">
              <OsobyKatalog />
            </TabsContent>
          )}
          {canSeeAdminTabs && (
            <TabsContent value="kapacita" className="flex-1 overflow-hidden mt-3 pt-2">
              <OsobyKapacita />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
