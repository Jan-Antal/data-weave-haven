/**
 * lookup-ico — Czech ARES company lookup with 30-day cache.
 *
 * POST { ico: string (8 digits) }
 * → 200 { source: "cache" | "ares", data: AresCompanyData }
 * → 400 { error } — invalid IČO
 * → 404 { error } — IČO not found in ARES (cached as negative for 30d)
 * → 503 { error } — ARES upstream temporarily unavailable (NOT cached)
 *
 * Cache table: public.ares_cache (service-role write, authenticated read).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ARES_BASE =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CacheRow {
  ico: string;
  obchodni_jmeno: string | null;
  dic: string | null;
  adresa: string | null;
  mesto: string | null;
  psc: string | null;
  ulice: string | null;
  pravni_forma: string | null;
  datum_vzniku: string | null;
  not_found: boolean;
  fetched_at: string;
}

function rowToData(row: CacheRow) {
  return {
    ico: row.ico,
    obchodni_jmeno: row.obchodni_jmeno ?? "",
    dic: row.dic,
    adresa: row.adresa ?? "",
    mesto: row.mesto ?? "",
    psc: row.psc ?? "",
    ulice: row.ulice,
    pravni_forma: row.pravni_forma ?? "",
    datum_vzniku: row.datum_vzniku,
  };
}

interface AresApiResponse {
  obchodniJmeno?: string;
  dic?: string;
  pravniForma?: string;
  datumVzniku?: string;
  sidlo?: {
    textovaAdresa?: string;
    nazevObce?: string;
    psc?: string | number;
    nazevUlice?: string;
    cisloDomovni?: string | number;
    cisloOrientacni?: string | number;
  };
}

function mapAres(ico: string, raw: AresApiResponse) {
  const sidlo = raw.sidlo ?? {};
  let ulice: string | null = null;
  if (sidlo.nazevUlice) {
    const cisloD = sidlo.cisloDomovni != null ? String(sidlo.cisloDomovni) : "";
    const cisloO =
      sidlo.cisloOrientacni != null ? String(sidlo.cisloOrientacni) : "";
    const cislo = [cisloD, cisloO].filter(Boolean).join("/");
    ulice = cislo ? `${sidlo.nazevUlice} ${cislo}` : sidlo.nazevUlice;
  } else if (sidlo.cisloDomovni != null) {
    ulice = String(sidlo.cisloDomovni);
  }

  return {
    ico,
    obchodni_jmeno: raw.obchodniJmeno ?? "",
    dic: raw.dic ?? null,
    adresa: sidlo.textovaAdresa ?? "",
    mesto: sidlo.nazevObce ?? "",
    psc: sidlo.psc != null ? String(sidlo.psc) : "",
    ulice,
    pravni_forma: raw.pravniForma ?? "",
    datum_vzniku: raw.datumVzniku ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { ico?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Neplatné telo požiadavky" }, 400);
  }

  const ico = typeof body.ico === "string" ? body.ico.trim() : "";
  if (!/^\d{8}$/.test(ico)) {
    return json({ error: "Neplatné IČO — musí mať presne 8 číslic" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1) Cache lookup
  const { data: cached, error: cacheErr } = await supabase
    .from("ares_cache")
    .select("*")
    .eq("ico", ico)
    .maybeSingle();

  if (cacheErr) {
    console.error("[lookup-ico] cache read error", cacheErr);
    // Don't bail — fall through to ARES.
  }

  if (cached) {
    const fetchedAtMs = new Date(cached.fetched_at).getTime();
    const fresh = Date.now() - fetchedAtMs < TTL_MS;
    if (fresh) {
      if (cached.not_found) {
        return json(
          { error: "IČO nenájdené v registri ARES", source: "cache" },
          404
        );
      }
      return json({ source: "cache", data: rowToData(cached as CacheRow) });
    }
  }

  // 2) Call ARES
  let aresRes: Response;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    aresRes = await fetch(`${ARES_BASE}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
  } catch (e) {
    console.error("[lookup-ico] ARES network error", e);
    return json(
      { error: "ARES je momentálne nedostupné, skús neskôr." },
      503
    );
  }

  if (aresRes.status === 404) {
    // Negative cache
    await supabase.from("ares_cache").upsert(
      {
        ico,
        not_found: true,
        raw_data: null,
        obchodni_jmeno: null,
        dic: null,
        adresa: null,
        mesto: null,
        psc: null,
        ulice: null,
        pravni_forma: null,
        datum_vzniku: null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "ico" }
    );
    return json({ error: "IČO nenájdené v registri ARES", source: "ares" }, 404);
  }

  if (!aresRes.ok) {
    console.error("[lookup-ico] ARES non-ok status", aresRes.status);
    return json(
      { error: "ARES je momentálne nedostupné, skús neskôr." },
      503
    );
  }

  let aresJson: AresApiResponse;
  try {
    aresJson = await aresRes.json();
  } catch (e) {
    console.error("[lookup-ico] ARES JSON parse error", e);
    return json(
      { error: "ARES vrátil neočakávanú odpoveď, skús neskôr." },
      503
    );
  }

  const mapped = mapAres(ico, aresJson);

  // 3) Upsert into cache
  const { error: upErr } = await supabase.from("ares_cache").upsert(
    {
      ...mapped,
      raw_data: aresJson as unknown as Record<string, unknown>,
      not_found: false,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "ico" }
  );

  if (upErr) {
    console.error("[lookup-ico] cache upsert error", upErr);
    // Don't fail the request — we still have the data.
  }

  return json({ source: "ares", data: mapped });
});
