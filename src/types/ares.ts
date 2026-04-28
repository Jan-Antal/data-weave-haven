/**
 * ARES (Administratívny register ekonomických subjektov) lookup types.
 *
 * Fields mirror the `ares_cache` table columns (snake_case) for direct
 * round-trip with the `lookup-ico` edge function.
 */

export interface AresCompanyData {
  ico: string;
  obchodni_jmeno: string;
  dic: string | null;
  adresa: string;
  mesto: string;
  psc: string;
  ulice: string | null;
  pravni_forma: string;
  /** ISO date string YYYY-MM-DD */
  datum_vzniku: string | null;
}

export interface AresLookupResponse {
  data?: AresCompanyData;
  source: "cache" | "ares";
  error?: string;
}
