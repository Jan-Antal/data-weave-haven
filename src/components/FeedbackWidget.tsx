import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { user, profile } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    await supabase.from("feedback").insert({
      user_id: user.id,
      user_email: profile?.email || user.email || "",
      user_name: profile?.full_name || "",
      message: message.trim(),
    });
    setSending(false);
    setSent(true);
    setMessage("");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 2000);
  };

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50">
      {/* Popup */}
      {open && (
        <div className="absolute bottom-16 right-0 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          {sent ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <Check className="h-6 w-6 text-[#2d5a3d]" />
              </div>
              <span className="text-sm font-medium text-gray-700">Děkujeme za zpětnou vazbu!</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">Zpětná vazba</span>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4">
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Napište svůj nápad, problém nebo návrh..."
                  className="w-full min-h-[120px] border border-gray-200 rounded-lg text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#2d5a3d]/20 focus:border-[#2d5a3d]/40 transition"
                />
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className="w-full bg-[#2d5a3d] hover:bg-[#244d33] text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Odesílání..." : "Odeslat"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 bg-white border border-gray-200 shadow-lg rounded-full flex items-center justify-center hover:shadow-xl transition text-gray-500 hover:text-gray-700"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
