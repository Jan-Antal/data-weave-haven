import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileProjectDetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const CLOSE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;

export function MobileProjectDetailSheet({ open, title, onClose, children }: MobileProjectDetailSheetProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef({ startY: 0, startTime: 0, dragging: false });
  const sheetRef = useRef<HTMLDivElement>(null);

  // Open animation
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const t = setTimeout(() => { setVisible(false); setDragY(0); }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const close = useCallback(() => {
    setAnimating(false);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  // Touch handlers for swipe-down-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow drag from top 80px area
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touchY = e.touches[0].clientY - rect.top;
    if (touchY > 80) return;
    dragRef.current = { startY: e.touches[0].clientY, startTime: Date.now(), dragging: true };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.dragging) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    // Only allow downward drag (negative = up, ignore)
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return;
    const elapsed = (Date.now() - dragRef.current.startTime) / 1000;
    const velocity = dragY / elapsed;
    
    if (dragY > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD * 1000) {
      close();
    } else {
      setDragY(0);
    }
    dragRef.current.dragging = false;
  }, [dragY, close]);

  if (!visible) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[99999]">
      {/* Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-200",
          animating && dragY === 0 ? "opacity-100" : !animating ? "opacity-0" : undefined
        )}
        style={dragY > 0 ? { opacity: Math.max(0, 0.6 - (dragY / window.innerHeight) * 0.6) } : undefined}
        onClick={close}
      />

      {/* Sheet card - slides from top */}
      <div
        ref={sheetRef}
        className={cn(
          "absolute inset-x-0 top-0 bg-background flex flex-col transition-transform duration-200 ease-out rounded-b-2xl shadow-2xl overflow-hidden"
        )}
        style={{
          height: "calc(100vh - 70px - env(safe-area-inset-bottom, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          transform: animating && dragY === 0
            ? "translateY(0)"
            : dragY > 0
              ? `translateY(${dragY}px)`
              : "translateY(-100%)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <h2 className="text-base font-semibold truncate pr-2">{title}</h2>
          <button
            onClick={close}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
