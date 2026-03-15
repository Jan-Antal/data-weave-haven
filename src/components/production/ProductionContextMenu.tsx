import { useEffect, useRef } from "react";

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

  const MENU_WIDTH = 220;
  const MENU_HEIGHT = actions.length * 40;
  const adjustedLeft = x + MENU_WIDTH > window.innerWidth ? x - MENU_WIDTH : x;
  const adjustedTop = y + MENU_HEIGHT > window.innerHeight ? y - MENU_HEIGHT : y;

  const style: React.CSSProperties = {
    position: "fixed",
    left: adjustedLeft,
    top: adjustedTop,
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
          {i === 0 && !action.danger && !action.dividerBefore ? (
            <div
              className="flex items-center gap-2 px-3 py-[6px]"
              style={{ fontSize: 10, color: darkMode ? "#8899aa" : "#8a8578", fontWeight: 600, letterSpacing: 0.3, cursor: "default" }}
            >
              <span style={{ fontSize: 11, width: 16, textAlign: "center" }}>{action.icon}</span>
              {action.label}
            </div>
          ) : (
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
          )}
        </div>
      ))}
    </div>
  );
}
