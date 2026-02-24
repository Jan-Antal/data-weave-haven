import { useState, useCallback, useRef } from "react";

const LOCKED_KEYS = new Set(["project_id", "project_name"]);

export interface HeaderDragState {
  dragKey: string | null;
  dropTarget: { key: string; side: "left" | "right" } | null;
}

export function useHeaderDrag(
  orderedKeys: string[],
  onReorder: (newKeys: string[]) => void
) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; side: "left" | "right" } | null>(null);
  const dragKeyRef = useRef<string | null>(null);

  const handleDragStart = useCallback((key: string, e: React.DragEvent) => {
    if (LOCKED_KEYS.has(key)) {
      e.preventDefault();
      return;
    }
    dragKeyRef.current = key;
    setDragKey(key);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent drag image
    const el = e.currentTarget as HTMLElement;
    if (e.dataTransfer.setDragImage) {
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.style.opacity = "0.6";
      ghost.style.position = "absolute";
      ghost.style.top = "-9999px";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 20, 20);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  }, []);

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    if (LOCKED_KEYS.has(key) || key === dragKeyRef.current) {
      setDropTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? "left" : "right";
    setDropTarget({ key, side });
  }, []);

  const handleDrop = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    const fromKey = dragKeyRef.current;
    if (!fromKey || LOCKED_KEYS.has(key) || fromKey === key) {
      setDragKey(null);
      setDropTarget(null);
      dragKeyRef.current = null;
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? "left" : "right";

    // Compute new order
    const filtered = orderedKeys.filter((k) => k !== fromKey);
    const targetIdx = filtered.indexOf(key);
    const insertIdx = side === "left" ? targetIdx : targetIdx + 1;
    const newOrder = [...filtered.slice(0, insertIdx), fromKey, ...filtered.slice(insertIdx)];
    onReorder(newOrder);

    setDragKey(null);
    setDropTarget(null);
    dragKeyRef.current = null;
  }, [orderedKeys, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragKey(null);
    setDropTarget(null);
    dragKeyRef.current = null;
  }, []);

  const getDragProps = useCallback((key: string) => {
    if (LOCKED_KEYS.has(key)) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => handleDragStart(key, e),
      onDragOver: (e: React.DragEvent) => handleDragOver(key, e),
      onDrop: (e: React.DragEvent) => handleDrop(key, e),
      onDragEnd: handleDragEnd,
    };
  }, [handleDragStart, handleDragOver, handleDrop, handleDragEnd]);

  return { dragKey, dropTarget, getDragProps };
}
