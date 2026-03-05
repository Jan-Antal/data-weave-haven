import { format, parse, isValid } from "date-fns";

/** App-wide date display format: Czech D. M. YYYY (e.g. 5. 3. 2026) */
export const APP_DATE_FORMAT = "d. M. yyyy";

/**
 * All formats we accept when parsing stored dates.
 * Order matters — we try the new canonical format first,
 * then legacy US-style M/D formats (which is how dates were originally entered),
 * then other fallbacks.
 */
export const PARSE_FORMATS = [
  "d. M. yyyy",    // Czech canonical: 5. 3. 2026
  "dd-MMM-yy",     // legacy: 15-Mar-26
  "M/d/yyyy",      // legacy US full year: 3/15/2026
  "M/d/yy",        // legacy US short year: 3/15/26
  "yyyy-MM-dd",    // ISO
  "d.M.yyyy",      // Czech dot format
  "dd.MM.yyyy",    // Czech dot format padded
];

/** Format a Date object to the app standard string */
export function formatAppDate(d: Date): string {
  return format(d, APP_DATE_FORMAT);
}

/** Try to parse a date string using known formats */
export function parseAppDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;

  // Handle ISO timestamp with timezone (Supabase format): 2026-02-15T23:00:00.000Z
  // Extract the date part and parse as local to avoid UTC timezone shifts
  if (dateStr.includes('T')) {
    const datePart = dateStr.split('T')[0]; // "2026-02-15"
    const [year, month, day] = datePart.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return isValid(d) && d.getFullYear() > 1900 ? d : undefined;
  }

  for (const fmt of PARSE_FORMATS) {
    try {
      const d = parse(dateStr, fmt, new Date());
      if (isValid(d) && d.getFullYear() > 1900) return d;
    } catch { /* skip */ }
  }
  return undefined;
}
