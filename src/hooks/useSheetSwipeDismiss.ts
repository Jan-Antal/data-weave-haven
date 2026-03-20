import { useRef, useCallback } from "react";

interface UseSheetSwipeDismissOptions {
  onDismiss: () => void;
  /** Vertical drag threshold in px (default 80) */
  verticalThreshold?: number;
  /** Horizontal threshold as fraction of screen width (default 0.3) */
  horizontalFraction?: number;
}

/**
 * Combined vertical (swipe-down) + horizontal (swipe-left) dismiss gesture for bottom sheets.
 * Returns touch handlers + a ref to attach to the SheetContent element.
 */
export function useSheetSwipeDismiss({
  onDismiss,
  verticalThreshold = 80,
  horizontalFraction = 0.3,
}: UseSheetSwipeDismissOptions) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    axis: null as "h" | "v" | null,
    active: false,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      currentX: t.clientX,
      currentY: t.clientY,
      axis: null,
      active: true,
    };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g.active || !sheetRef.current) return;

    const t = e.touches[0];
    g.currentX = t.clientX;
    g.currentY = t.clientY;

    const dx = g.currentX - g.startX;
    const dy = g.currentY - g.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Lock axis on first significant movement
    if (!g.axis && (absDx > 10 || absDy > 10)) {
      g.axis = absDx > absDy ? "h" : "v";
    }

    const el = sheetRef.current;
    const overlay = el.previousElementSibling as HTMLElement | null;

    if (g.axis === "v") {
      const clampedDy = Math.max(0, dy);
      el.style.transition = "none";
      el.style.transform = `translateY(${clampedDy}px)`;
      if (overlay) {
        overlay.style.transition = "none";
        overlay.style.opacity = String(1 - Math.min(clampedDy / 300, 1));
      }
    } else if (g.axis === "h" && dx < 0) {
      // Only allow swipe left (negative dx)
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
      if (overlay) {
        overlay.style.transition = "none";
        overlay.style.opacity = String(1 - Math.min(absDx / 400, 1));
      }
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const g = gestureRef.current;
    if (!g.active || !sheetRef.current) return;
    g.active = false;

    const dx = g.currentX - g.startX;
    const dy = g.currentY - g.startY;
    const el = sheetRef.current;
    const overlay = el.previousElementSibling as HTMLElement | null;
    const screenW = window.innerWidth;

    const dismiss = (transform: string) => {
      el.style.transition = "transform 0.22s ease";
      el.style.transform = transform;
      if (overlay) {
        overlay.style.transition = "opacity 0.22s ease";
        overlay.style.opacity = "0";
      }
      setTimeout(onDismiss, 220);
    };

    const snapBack = () => {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "translate(0, 0)";
      if (overlay) {
        overlay.style.transition = "opacity 0.2s ease";
        overlay.style.opacity = "1";
      }
    };

    if (g.axis === "v" && dy > verticalThreshold) {
      dismiss(`translateY(${el.offsetHeight}px)`);
    } else if (g.axis === "h" && -dx > screenW * horizontalFraction) {
      dismiss("translateX(-100vw)");
    } else {
      snapBack();
    }

    g.axis = null;
  }, [onDismiss, verticalThreshold, horizontalFraction]);

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd };
}
