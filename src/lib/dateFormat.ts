import { format, parse, isValid } from "date-fns";

/** App-wide date display format: DD-Mon-YY (e.g. 02-Mar-26) */
export const APP_DATE_FORMAT = "dd-MMM-yy";

/**
 * All formats we accept when parsing stored dates.
 * Order matters — we try the new canonical format first,
 * then legacy US-style M/D formats (which is how dates were originally entered),
 * then other fallbacks.
 */
export const PARSE_FORMATS = [
  "dd-MMM-yy",     // new canonical: 15-Mar-26
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
  for (const fmt of PARSE_FORMATS) {
    try {
      const d = parse(dateStr, fmt, new Date());
      if (isValid(d) && d.getFullYear() > 1900) return d;
    } catch { /* skip */ }
  }
  return undefined;
}
