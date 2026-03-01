import { useState, useEffect, useCallback, useRef } from "react";

const PAGE_SIZE = 30;
const THRESHOLD = 200;

/**
 * Client-side infinite scroll: returns a slice of `items` that grows
 * as the user scrolls near the bottom of `scrollRef`.
 *
 * Resets to PAGE_SIZE whenever `resetKey` changes (filters, sort, etc.).
 */
export function useInfiniteScroll<T>(
  items: T[],
  scrollRef: React.RefObject<HTMLElement | null>,
  resetKey: string
) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const prevResetKey = useRef(resetKey);

  // Reset when filters/sort change
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      setVisibleCount(PAGE_SIZE);
      prevResetKey.current = resetKey;
    }
  }, [resetKey]);

  const hasMore = visibleCount < items.length;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < THRESHOLD) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length));
    }
  }, [hasMore, items.length, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll, scrollRef]);

  const visible = items.slice(0, visibleCount);

  return { visible, hasMore, visibleCount, totalCount: items.length };
}
