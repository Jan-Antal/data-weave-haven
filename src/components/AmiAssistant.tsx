import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_CHIPS = [
  { emoji: "📋", label: "Jak plánovat výrobu?" },
  { emoji: "🔍", label: "Jak najít projekt?" },
  { emoji: "💬", label: "Napsat zprávu adminovi" },
];

const FEEDBACK_TRIGGERS = ["napsat zprávu", "chci napsat", "mám problém", "feedback", "zprávu adminovi"];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ami-assistant`;

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  onDelta: (t: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    onError(err.error || "Chyba komunikace s asistentem.");
    return;
  }
  if (!resp.body) { onError("Prázdná odpověď."); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let ni: number;
    while ((ni = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, ni);
      buf = buf.slice(ni + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content as string | undefined;
        if (c) onDelta(c);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
  onDone();
}

export function AmiAssistant() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collapse pill after 5s
  useEffect(() => {
    const t = setTimeout(() => setCollapsed(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // First-time tooltip
  useEffect(() => {
    const flag = localStorage.getItem("ami-assistant-welcomed");
    if (!flag) {
      const t = setTimeout(() => setShowTooltip(true), 1500);
      const t2 = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem("ami-assistant-welcomed", "1");
      }, 9500);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  }, []);

  const dismissTooltip = () => {
    setShowTooltip(false);
    localStorage.setItem("ami-assistant-welcomed", "1");
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };

    // Check if entering feedback mode
    if (FEEDBACK_TRIGGERS.some(t => text.toLowerCase().includes(t)) && !feedbackMode) {
      setMessages(prev => [...prev, userMsg, { role: "assistant", content: "Jasně! Napiš svou zprávu a já ji předám adminovi. ✉️" }]);
      setFeedbackMode(true);
      setInput("");
      return;
    }

    // Handle feedback submission
    if (feedbackMode) {
      setMessages(prev => [...prev, userMsg]);
      setLoading(true);
      setInput("");
      try {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            feedbackMode: true,
            feedbackMessage: text.trim(),
            userId: user?.id,
            userEmail: profile?.email || user?.email,
          }),
        });
        if (resp.ok) {
          setMessages(prev => [...prev, { role: "assistant", content: "Díky! Zpráva byla odeslána. Admin se ti ozve. 👍" }]);
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: "Nepodařilo se odeslat zprávu. Zkus to prosím znovu." }]);
        }
      } catch {
        setMessages(prev => [...prev, { role: "assistant", content: "Nepodařilo se odeslat zprávu. Zkus to prosím znovu." }]);
      }
      setFeedbackMode(false);
      setLoading(false);
      return;
    }

    // Normal AI chat
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > allMessages.length) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev.slice(0, allMessages.length), { role: "assistant", content: assistantSoFar }];
      });
    };

    await streamChat({
      messages: allMessages,
      onDelta: (chunk) => upsert(chunk),
      onDone: () => setLoading(false),
      onError: (msg) => {
        setMessages(prev => [...prev, { role: "assistant", content: msg }]);
        setLoading(false);
      },
    });
  }, [messages, loading, feedbackMode, user, profile]);

  const handleChip = (chip: typeof QUICK_CHIPS[0]) => {
    sendMessage(`${chip.emoji} ${chip.label}`);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Tooltip for first-time users */}
      {showTooltip && !open && (
        <button
          onClick={dismissTooltip}
          className="fixed z-[9998] animate-fade-in"
          style={{ bottom: 56, right: 16 }}
        >
          <div className="bg-white text-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border max-w-[220px]">
            Ahoj! Jsem tu, když budeš potřebovat pomoc 👋
            <div className="absolute -bottom-1.5 left-5 w-3 h-3 bg-white border-r border-b border-border rotate-45" />
          </div>
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
          style={{
            bottom: 60,
            right: 16,
            width: 340,
            height: 440,
            border: "1px solid #e2ddd6",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0" style={{ background: "#223937" }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">A</div>
              <span className="text-white text-sm font-semibold">AMI Asistent</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {!hasMessages && (
              <div className="flex flex-col items-center text-center pt-6 pb-4 gap-4">
                <span className="text-lg">Ahoj! 👋</span>
                <span className="text-sm text-muted-foreground">Jak ti mohu pomoci?</span>
                <div className="flex flex-col gap-2 w-full mt-2">
                  {QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => handleChip(chip)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                    >
                      {chip.emoji} {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "text-white rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                  style={msg.role === "user" ? { background: "#223937" } : undefined}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-muted text-foreground px-3 py-2 rounded-xl rounded-bl-sm text-xs flex gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse" style={{ animationDelay: "150ms" }}>●</span>
                  <span className="animate-pulse" style={{ animationDelay: "300ms" }}>●</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 px-3 py-2 border-t border-border">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={feedbackMode ? "Napiš zprávu pro admina..." : "Napiš dotaz..."}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg transition-colors disabled:opacity-30"
                style={{ background: "#223937", color: "white" }}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={() => { setOpen(o => !o); dismissTooltip(); }}
        onMouseEnter={() => setCollapsed(false)}
        onMouseLeave={() => setCollapsed(true)}
        className="fixed z-[9998] flex items-center gap-1.5 transition-all duration-300 hover:scale-105 group"
        style={{
          bottom: 16,
          right: 16,
          height: collapsed ? 40 : 28,
          width: collapsed ? 40 : "auto",
          borderRadius: collapsed ? 20 : 8,
          background: "#223937",
          color: "white",
          fontSize: 10,
          padding: collapsed ? 0 : "0 10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          justifyContent: "center",
        }}
      >
        <MessageCircle className="shrink-0" style={{ width: collapsed ? 20 : 14, height: collapsed ? 20 : 14 }} />
        {!collapsed && (
          <span className="whitespace-nowrap animate-fade-in font-medium">Potřebuješ pomoc?</span>
        )}

        {/* Pulse ring */}
        {collapsed && (
          <span className="absolute inset-0 rounded-full ami-pulse-ring" />
        )}
      </button>
    </>
  );
}
