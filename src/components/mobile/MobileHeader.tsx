import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Menu, UserCog, LogOut, BarChart3, Home, Bell } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { AccountSettings } from "@/components/AccountSettings";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "@/components/NotificationPanel";

const ROLE_LABELS: Record<string, string> = {
  owner: "Vlastník",
  admin: "Admin",
  pm: "Projektový manažer",
  konstrukter: "Konstruktér",
  vyroba: "Výroba",
  viewer: "Čtenář",
  tester: "Tester",
};

interface MobileHeaderProps {
  onDataLog?: () => void;
  showDataLog?: boolean;
  isDataLogOpen?: boolean;
  onCloseDataLog?: () => void;
}

export function MobileHeader({ onDataLog, showDataLog = false, isDataLogOpen = false, onCloseDataLog }: MobileHeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { user, profile, role, signOut } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <>
      <header
        ref={(el) => {
          if (el) {
            const h = el.getBoundingClientRect().height;
            document.documentElement.style.setProperty('--mobile-header-height', `${h}px`);
          }
        }}
        className="md:hidden border-b bg-primary px-4 pb-3 shrink-0 relative z-[300]"
        style={{ paddingTop: "0px" }}
      >
        <div className="flex items-center justify-between">
          <img
            src="/images/AM-Interior-orange.svg"
            alt="AM Interior"
            style={{ height: '18px', width: 'auto', cursor: 'pointer' }}
            onClick={() => navigate("/", { state: { view: "dashboard" } })}
          />
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const wasDataLogOpen = isDataLogOpen;
                setMenuOpen(false);
                if (onCloseDataLog) onCloseDataLog();
                // If DataLog was open, explicitly open notif (don't toggle)
                if (wasDataLogOpen) {
                  setNotifOpen(true);
                } else {
                  setNotifOpen(o => !o);
                }
              }}
              className="relative p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-semibold px-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                const wasDataLogOpen = isDataLogOpen;
                setNotifOpen(false);
                if (onCloseDataLog) onCloseDataLog();
                // If DataLog was open, explicitly open menu (don't toggle)
                if (wasDataLogOpen) {
                  setMenuOpen(true);
                } else {
                  setMenuOpen(o => !o);
                }
              }}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[280px] p-0" style={{ top: "var(--mobile-header-height, 56px)", height: "calc(100% - var(--mobile-header-height, 56px))", zIndex: 200 }}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="p-5 border-b border-border">
            <p className="font-medium text-sm text-foreground">{profile?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ROLE_LABELS[role || ""] || role}
            </p>
          </div>
          <div className="py-2">
            <button
              onClick={() => { setMenuOpen(false); navigate("/", { state: { view: "dashboard" } }); }}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px]"
            >
              <Home className="h-4 w-4 text-muted-foreground" />
              <span>Přehled</span>
            </button>
            <Separator className="my-1" />
            {showDataLog && onDataLog && (
              <button
                onClick={() => { setMenuOpen(false); onDataLog(); }}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px]"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span>Data Log</span>
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); setAccountOpen(true); }}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px]"
            >
              <UserCog className="h-4 w-4 text-muted-foreground" />
              <span>Nastavení účtu</span>
            </button>
            <button
              onClick={() => { setMenuOpen(false); signOut(); }}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px] text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Odhlásit se</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AccountSettings open={accountOpen} onOpenChange={setAccountOpen} />

      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent
          side="bottom"
          className="p-0 flex flex-col rounded-t-2xl bottom-[56px] max-h-[calc(100svh-112px)] z-[200]"
        >
          <SheetTitle className="sr-only">Notifikace</SheetTitle>
          <div className="flex flex-col items-center pt-3 pb-2 border-b border-border shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted mb-2" />
            <div className="flex items-center justify-between w-full px-4">
              <button onClick={() => setNotifOpen(false)} className="text-sm text-muted-foreground">
                ← Zpět
              </button>
              <span className="font-semibold text-sm">Notifikace</span>
              <div className="w-12" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pb-4">
            <NotificationPanel onClose={() => setNotifOpen(false)} mobile />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
