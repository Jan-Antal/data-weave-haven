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
}

export function ProductionContextMenu({ x, y, actions, onClose }: ProductionContextMenuProps) {
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

  const style: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 9999,
    backgroundColor: "#ffffff",
    border: "1px solid #e2ddd6",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(34,57,55,0.12)",
    padding: "4px 0",
    minWidth: 200,
  };

  return (
    <div ref={ref} style={style}>
      {actions.map((action, i) => (
        <div key={i}>
          {action.dividerBefore && (
            <div className="mx-2 my-1" style={{ borderTop: "1px solid #ece8e2" }} />
          )}
          <button
            className="w-full flex items-center gap-2 px-3 py-[6px] text-left transition-colors"
            style={{ fontSize: 11, color: action.danger ? "#dc3545" : "#223937" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = action.danger ? "rgba(220,53,69,0.04)" : "#f0eee9")}
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
