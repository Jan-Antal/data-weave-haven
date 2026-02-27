import { useState, useEffect } from "react";
import { Mail, X, MailOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { SwipeableMessage } from "./SwipeableMessage";

interface FeedbackItem {
  id: string;
  user_name: string;
  user_email: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "právě teď";
  if (mins < 60) return `před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `před ${hours} hod`;
  const days = Math.floor(hours / 24);
  return `před ${days} dny`;
}

const UNDO_DURATION = 5000;
let deleteUndoTimeout: ReturnType<typeof setTimeout> | null = null;
let deleteUndoDismiss: (() => void) | null = null;

export function AdminInboxButton() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setItems(data as FeedbackItem[]);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchItems();

    const channel = supabase
      .channel("feedback-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, () => {
        fetchItems();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const unreadCount = items.filter(i => !i.is_read).length;

  const toggleRead = async (item: FeedbackItem) => {
    const newVal = !item.is_read;
    await supabase.from("feedback").update({ is_read: newVal }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: newVal } : i));
  };

  const handleClickMessage = (item: FeedbackItem) => {
    if (!item.is_read) {
      supabase.from("feedback").update({ is_read: true }).eq("id", item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
    }
    setExpanded(prev => prev === item.id ? null : item.id);
  };

  const deleteMessage = async (item: FeedbackItem) => {
    // Remove from UI immediately
    setItems(prev => prev.filter(i => i.id !== item.id));

    // Clear previous undo
    if (deleteUndoTimeout) { clearTimeout(deleteUndoTimeout); deleteUndoTimeout = null; }
    if (deleteUndoDismiss) { deleteUndoDismiss(); deleteUndoDismiss = null; }

    // Hard delete
    await supabase.from("feedback").delete().eq("id", item.id);

    const handleUndo = async () => {
      if (deleteUndoTimeout) { clearTimeout(deleteUndoTimeout); deleteUndoTimeout = null; }
      // Re-insert the message
      const { error } = await supabase.from("feedback").insert({
        id: item.id,
        user_id: item.id, // will be overridden by original data
        user_name: item.user_name,
        user_email: item.user_email,
        message: item.message,
        is_read: item.is_read,
        created_at: item.created_at,
      } as any);
      if (!error) {
        setItems(prev => [item, ...prev].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        toast({ title: "Zpráva obnovena" });
      }
    };

    const { dismiss } = toast({
      duration: UNDO_DURATION,
      className: "bg-gray-100 text-gray-700 border-gray-200 shadow-md",
      title: (
        <div className="flex items-center justify-between w-full gap-4">
          <span className="text-sm font-medium text-gray-700">Zpráva smazána</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleUndo(); dismiss(); }}
            className="text-gray-500 font-medium hover:text-gray-700 transition-colors text-sm shrink-0"
          >
            Zpět
          </button>
        </div>
      ) as any,
      description: (
        <div className="mt-2 w-full">
          <div
            className="h-0.5 bg-gray-300 rounded-full origin-left"
            style={{ animation: `undo-shrink ${UNDO_DURATION}ms linear forwards` }}
          />
          <style>{`@keyframes undo-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
        </div>
      ) as any,
    });

    deleteUndoDismiss = dismiss;
    deleteUndoTimeout = setTimeout(() => {
      deleteUndoTimeout = null;
      deleteUndoDismiss = null;
    }, UNDO_DURATION);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
      >
        <Mail className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/20 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-96 max-w-full bg-white shadow-2xl z-[61] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">Zpětná vazba</span>
                {unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-[11px] font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                  <MailOpen className="h-10 w-10 opacity-40" />
                  <span className="text-sm">Žádné zprávy</span>
                </div>
              ) : (
                items.map(item => {
                  const isExpanded = expanded === item.id;
                  return (
                    <SwipeableMessage
                      key={item.id}
                      isRead={item.is_read}
                      onDelete={() => deleteMessage(item)}
                      onToggleRead={() => toggleRead(item)}
                    >
                      <button
                        onClick={() => handleClickMessage(item)}
                        className={`w-full text-left px-5 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                          !item.is_read ? "border-l-2 border-l-[#2d5a3d] bg-green-50/30" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm ${!item.is_read ? "font-semibold" : "font-medium"} text-gray-800 truncate`}>
                            {item.user_name || item.user_email}
                          </span>
                          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeAgo(item.created_at)}</span>
                        </div>
                        {item.user_name && (
                          <div className="text-xs text-gray-400 truncate">{item.user_email}</div>
                        )}
                        <p className={`text-sm text-gray-600 mt-1 ${isExpanded ? "" : "line-clamp-3"}`}>
                          {item.message}
                        </p>
                      </button>
                    </SwipeableMessage>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
