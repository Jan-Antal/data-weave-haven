import { useEffect, useCallback, useRef } from "react";

/**
 * Hook that listens for datalog-highlight events and scrolls to + highlights the matching project row.
 * Call this once per table component.
 */
export function useDataLogRowHighlight() {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: Event) => {
      const projectId = (e as CustomEvent).detail?.projectId;
      if (!projectId) return;

      const row = document.querySelector(`[data-project-id="${projectId}"]`);
      if (!row) return;

      // Clear previous highlights
      document.querySelectorAll(".datalog-row-highlight").forEach(el => {
        el.classList.remove("datalog-row-highlight");
      });

      row.scrollIntoView({ behavior: "smooth", block: "center" });

      if (timerRef.current) clearTimeout(timerRef.current);

      // Small delay so scroll completes before animation starts
      setTimeout(() => {
        row.classList.add("datalog-row-highlight");
      }, 100);

      timerRef.current = setTimeout(() => {
        row.classList.remove("datalog-row-highlight");
      }, 2600);
    };

    document.addEventListener("datalog-highlight", handler);
    return () => document.removeEventListener("datalog-highlight", handler);
  }, []);
}
