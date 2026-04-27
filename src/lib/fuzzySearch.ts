/**
 * Fuzzy search utility — diacritic-insensitive + typo-tolerant.
 *
 * Examples:
 *   fuzzyMatch("Šantovka", "santovka") → true   (diacritics)
 *   fuzzyMatch("Allianz", "alianz")     → true   (1 char missing)
 *   fuzzyMatch("pícha", "pycha")        → true   (diacritics + typo)
 *   fuzzyMatch("pícha", "picha")        → true   (diacritics)
 *
 * Multi-token queries use AND logic: every whitespace-separated token in the
 * needle must match the haystack independently.
 */

/** Lowercase + strip diacritics (NFD). */
export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Damerau–Levenshtein distance with early-exit when the running minimum
 * exceeds `max`. Returns max+1 instead of the true distance in that case.
 */
function damerauLevenshtein(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Two/three rolling rows for DL transposition support.
  let prev2: number[] = new Array(bl + 1);
  let prev: number[] = new Array(bl + 1);
  let curr: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
      // Transposition (Damerau)
      if (
        i > 1 &&
        j > 1 &&
        ai === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    // Rotate rows
    const tmp = prev2;
    prev2 = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl];
}

/** Edit-distance tolerance based on token length. */
function tolerance(len: number): number {
  if (len <= 3) return 0; // very short: exact (avoid false positives)
  if (len <= 7) return 1;
  return 2;
}

const MAX_WORD_LEN = 40;

function tokensOf(text: string): string[] {
  return text.split(/[\s\-_/.,;:()\[\]]+/).filter(Boolean);
}

/**
 * Returns true if every token in `needle` matches `haystack`.
 * Match for a token = normalized substring OR Damerau–Levenshtein within
 * tolerance against any word in the haystack.
 */
export function fuzzyMatch(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  const h = normalize(haystack);
  if (!h) return false;
  const n = normalize(needle).trim();
  if (!n) return true;

  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const words = tokensOf(h);

  return tokens.every((token) => {
    if (h.includes(token)) return true;
    const tol = tolerance(token.length);
    if (tol === 0) return false;
    for (const w of words) {
      if (w.length > MAX_WORD_LEN) continue;
      if (Math.abs(w.length - token.length) > tol) continue;
      if (damerauLevenshtein(w, token, tol) <= tol) return true;
    }
    return false;
  });
}

/** Convenience: true if any non-empty field matches the needle. */
export function fuzzyMatchAny(
  fields: (string | null | undefined)[],
  needle: string
): boolean {
  if (!needle) return true;
  for (const f of fields) {
    if (f && fuzzyMatch(f, needle)) return true;
  }
  return false;
}
