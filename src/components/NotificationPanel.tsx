import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { NotificationSettings } from "@/components/NotificationSettings";

const TYPE_COLORS: Record<string, string> = {
  project_changed: "bg-blue-500",
  qc_defect: "bg-red-500",
  project_created: "bg-green-500",
  daylog_missing: "bg-orange-500",
};

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleClick = (n: Notification) => {
    if (!n.read) markAsRead(n.id);
    if (n.project_id) {
      navigate("/", { state: { openProjectId: n.project_id } });
    }
    onClose();
  };

  return (
    <>
      <div className="w-[380px] bg-background border border-border rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Notifikace</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Označit vše
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm">Žádné notifikace</span>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 cursor-pointer transition-colors"
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full text-white text-xs font-semibold shrink-0",
                    TYPE_COLORS[n.type] || "bg-muted-foreground"
                  )}
                  style={{ width: 36, height: 36 }}
                >
                  {n.actor_initials || "?"}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm leading-tight",
                      !n.read ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {n.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: cs })}
                  </p>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
          >
            Nastavení notifikací
          </button>
        </div>
      </div>

      <NotificationSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
