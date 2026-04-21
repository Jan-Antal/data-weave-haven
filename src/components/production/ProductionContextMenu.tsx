import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuAction {
  label: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

interface ProductionContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
  darkMode?: boolean;
}

export function ProductionContextMenu({ x, y, actions, onClose, darkMode }: ProductionContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // Re-position based on actual rendered size (accounts for variable label widths)
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
    if (top + rect.height + pad > vh) top = Math.max(pad, vh - rect.height - pad);
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, actions.length]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: pos.left,
    top: pos.top,
    zIndex: 9999,
    backgroundColor: darkMode ? "#1c1f26" : "#ffffff",
    border: darkMode ? "1px solid #3d4558" : "1px solid #e2ddd6",
    borderRadius: 6,
    boxShadow: darkMode ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(34,57,55,0.12)",
    padding: "4px 0",
    minWidth: 200,
  };

  return (
    <div ref={ref} style={style}>
      {actions.map((action, i) => (
        <div key={i}>
          {action.dividerBefore && <div style={{ height: 1, backgroundColor: darkMode ? "#3d4558" : "#e2ddd6", margin: "4px 0" }} />}
          <button
            className="w-full flex items-center gap-2 px-3 py-[6px] text-left transition-colors"
            style={{ fontSize: 11, color: action.danger ? "#dc3545" : darkMode ? "#c8d0e0" : "#223937" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = action.danger ? "rgba(220,53,69,0.08)" : darkMode ? "#252a35" : "#f0eee9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            onClick={() => {
              action.onClick();
              onClose();
            }}
          >
            <span style={{ fontSize: 12, width: 16, textAlign: "center" }}>{action.icon}</span>
            {action.label}
          </button>
        </div>
      ))}
    </div>
  );
}
