import { format, parse, isValid } from "date-fns";

/** App-wide date display format: DD-Mon-YY (e.g. 02-Mar-26) */
export const APP_DATE_FORMAT = "dd-MMM-yy";

/** All formats we accept when parsing stored dates */
export const PARSE_FORMATS = ["dd-MMM-yy", "yyyy-MM-dd", "d.M.yyyy", "dd.MM.yyyy", "d/M/yyyy"];

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
      if (isValid(d)) return d;
    } catch { /* skip */ }
  }
  return undefined;
}
