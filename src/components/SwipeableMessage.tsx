import { useState, useRef, useCallback } from "react";
import { Trash2, Mail, MailOpen } from "lucide-react";

interface SwipeableMessageProps {
  children: React.ReactNode;
  isRead: boolean;
  onDelete: () => void;
  onToggleRead: () => void;
}

const THRESHOLD = 0.35;
const AUTO_THRESHOLD = 0.5;

export function SwipeableMessage({ children, isRead, onDelete, onToggleRead }: SwipeableMessageProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [settled, setSettled] = useState<"left" | "right" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getWidth = () => containerRef.current?.offsetWidth ?? 384;

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (settled) {
      setSettled(null);
      setOffsetX(0);
      return;
    }
    startX.current = clientX;
    startY.current = clientY;
    isDragging.current = true;
    isHorizontal.current = null;
    setSwiping(true);
  }, [settled]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
        if (!isHorizontal.current) {
          isDragging.current = false;
          setSwiping(false);
          return;
        }
      } else return;
    }
    if (!isHorizontal.current) return;

    const w = getWidth();
    const clamped = Math.max(-w, Math.min(w, dx));
    setOffsetX(clamped);
  }, []);

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const w = getWidth();
    const ratio = Math.abs(offsetX) / w;

    if (offsetX < 0 && ratio >= AUTO_THRESHOLD) {
      // Auto-delete
      setOffsetX(-w);
      setTimeout(() => { onDelete(); setOffsetX(0); setSwiping(false); }, 200);
      return;
    }
    if (offsetX < 0 && ratio >= THRESHOLD) {
      setSettled("left");
      setOffsetX(-100);
      setSwiping(false);
      return;
    }
    if (offsetX > 0 && ratio >= THRESHOLD) {
      onToggleRead();
      setOffsetX(0);
      setSwiping(false);
      return;
    }
    setOffsetX(0);
    setSwiping(false);
  }, [offsetX, onDelete, onToggleRead]);

  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();

  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleStart(e.clientX, e.clientY); };
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const onMouseUp = () => handleEnd();
  const onMouseLeave = () => { if (isDragging.current) handleEnd(); };

  const leftBgOpacity = Math.min(1, Math.abs(Math.min(offsetX, 0)) / 100);
  const rightBgOpacity = Math.min(1, Math.max(offsetX, 0) / 100);

  return (
    <div ref={containerRef} className="relative overflow-hidden select-none">
      {/* Left swipe bg — delete */}
      <div
        className="absolute inset-0 flex items-center justify-end px-5 bg-red-500"
        style={{ opacity: leftBgOpacity }}
      >
        <div className="flex items-center gap-2 text-white text-sm font-medium">
          <span>Smazat</span>
          <Trash2 className="h-4 w-4" />
        </div>
      </div>

      {/* Right swipe bg — toggle read */}
      <div
        className="absolute inset-0 flex items-center justify-start px-5 bg-blue-500"
        style={{ opacity: rightBgOpacity }}
      >
        <div className="flex items-center gap-2 text-white text-sm font-medium">
          {isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
          <span>{isRead ? "Nepřečteno" : "Přečteno"}</span>
        </div>
      </div>

      {/* Settled delete button */}
      {settled === "left" && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); setSettled(null); setOffsetX(0); }}
          className="absolute right-0 inset-y-0 w-[100px] bg-red-500 text-white flex items-center justify-center gap-1.5 text-sm font-medium hover:bg-red-600 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Smazat
        </button>
      )}

      {/* Message content */}
      <div
        className="relative bg-white"
        style={{
          transform: `translateX(${settled === "left" ? -100 : offsetX}px)`,
          transition: swiping && isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
          opacity: swiping ? Math.max(0.7, 1 - Math.abs(offsetX) / getWidth() * 0.5) : 1,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </div>
  );
}
