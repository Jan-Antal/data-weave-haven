/**
 * Pracovný týždeň končí piatkom. Cez víkend (so/ne) sa už ako aktuálny
 * týždeň považuje nasledujúci kalendárny týždeň, takže nedokončené bundly
 * z práve uzavretého týždňa sa zobrazia ako "prelité" už od soboty
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

/** Skutočný ISO pondelok kalendárneho týždňa (po–ne grupa). */
export function getCalendarWeekMonday(reference: Date = new Date()): Date {
  const d = new Date(reference);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Týždeň, z ktorého sa zbierajú nedokončené projekty na "prelitie".
 * Po–Pia: aktuálny kalendárny týždeň (T).
 * So–Ne: práve skončený kalendárny týždeň (T = predchádzajúci kalendárny).
 */
export function getSpillSourceWeekMonday(reference: Date = new Date()): Date {
  const dest = getWorkWeekMonday(reference);
  const src = new Date(dest);
  src.setDate(src.getDate() - 7);
  return src;
}

/**
 * Týždeň, v ktorom sa prelité projekty zobrazia.
 * Po–Pia: ďalší kalendárny týždeň (T+1).
 * So–Ne: aktuálny pracovný týždeň (T+1 voči práve skončenému).
 */
export function getSpillDestinationWeekMonday(reference: Date = new Date()): Date {
  return getWorkWeekMonday(reference);
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

export function getSpillSourceWeekKey(reference: Date = new Date()): string {
  return toLocalDateKey(getSpillSourceWeekMonday(reference));
}

export function getSpillDestinationWeekKey(reference: Date = new Date()): string {
  return toLocalDateKey(getSpillDestinationWeekMonday(reference));
}
