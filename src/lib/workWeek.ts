/**
 * Vráti pondelok "aktuálneho pracovného týždňa".
 *
 * Pravidlo: pracovný týždeň končí piatkom. Cez víkend (so/ne) sa už ako
 * aktuálny týždeň považuje nasledujúci kalendárny týždeň, takže nedokončené
 * bundly z práve uzavretého týždňa sa zobrazia ako "prelité" už od soboty
 * a zostanú tak až do piatku ďalšieho týždňa.
 *
 * - Po–Pia → pondelok aktuálneho kalendárneho týždňa
 * - So     → pondelok nasledujúceho týždňa (+2 dni)
 * - Ne     → pondelok nasledujúceho týždňa (+1 deň)
 */
export function getWorkWeekMonday(reference: Date = new Date()): Date {
  const d = new Date(reference);
  const day = d.getDay(); // 0=Ne, 1=Po, ..., 6=So
  let diff: number;
  if (day === 0) diff = 1;
  else if (day === 6) diff = 2;
  else diff = 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Lokálny YYYY-MM-DD bez časovej zóny (zhodný s weekKey formátom). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** weekKey (YYYY-MM-DD pondelka) aktuálneho pracovného týždňa. */
export function getWorkWeekKey(reference: Date = new Date()): string {
  return toLocalDateKey(getWorkWeekMonday(reference));
}
