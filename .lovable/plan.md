
# ARES IČO auto-doplnenie firmy

Implementácia kompletného flow: užívateľ napíše 8-miestne IČO → systém zavolá ARES (cez edge function s cache vrstvou) → automaticky doplní názov firmy, DIČ, adresu, mesto, PSČ, ulicu.

## Poznámka k integrácii

V projekte neexistuje `SupplierForm.tsx`. IČO sa zadáva na 2 miestach a obe dostanú lookup:
1. `src/components/tpv/dodavatelia/AddSupplierDialog.tsx` (vytvorenie nového dodávateľa)
2. `src/components/tpv/dodavatelia/panes/OverviewPane.tsx` (editácia existujúceho)

Aby sa logika neduplikovala, vytvorím jeden zdieľaný komponent `IcoLookupField` a použijem ho na oboch miestach.

## Krok 1 — DB migrácia: `ares_cache`

```sql
create table public.ares_cache (
  ico text primary key check (ico ~ '^\d{8}$'),
  raw_data jsonb,
  obchodni_jmeno text,
  dic text,
  adresa text,
  mesto text,
  psc text,
  ulice text,
  pravni_forma text,
  datum_vzniku date,
  not_found boolean not null default false,
  fetched_at timestamptz not null default now()
);

create index ares_cache_fetched_at_idx on public.ares_cache (fetched_at);

alter table public.ares_cache enable row level security;

-- Akýkoľvek autentifikovaný user smie čítať cache
create policy "ares_cache_select_authenticated"
  on public.ares_cache for select
  to authenticated
  using (true);

-- Zápis robí výhradne edge function cez service role → žiadna client-side INSERT/UPDATE policy.
```

## Krok 2 — Edge function `lookup-ico`

Súbor: `supabase/functions/lookup-ico/index.ts`

Logika:
1. POST `{ ico: string }`. Validácia: presne 8 číslic (`/^\d{8}$/`) → inak 400 `"Neplatné IČO"`.
2. Cache lookup pomocou service-role klienta (`SUPABASE_SERVICE_ROLE_KEY`):
   - Ak existuje záznam a `fetched_at > now() - 30 days`:
     - `not_found = true` → 404 `"IČO nenájdené v ARES"`
     - inak 200 `{ source: "cache", data: {...} }`
3. Cache miss / expired:
   - `fetch("https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/" + ico)` s timeout (8s).
   - 404 → UPSERT s `not_found = true`, vráti 404 klientovi.
   - 200 → mapuj polia, UPSERT, vráti 200 `{ source: "ares", data: {...} }`.
   - 5xx / network / timeout → 503, **NEUKLADAJ** do cache (aby sa retry dalo).
4. Mapovanie ARES → cache columns:
   - `obchodniJmeno → obchodni_jmeno`
   - `dic → dic` (môže chýbať)
   - `sidlo.textovaAdresa → adresa`
   - `sidlo.nazevObce → mesto`
   - `String(sidlo.psc) → psc`
   - `sidlo.nazevUlice` + ` ` + `sidlo.cisloDomovni` → `ulice` (concat ak oba existujú; inak ten ktorý existuje)
   - `pravniForma → pravni_forma`
   - `datumVzniku → datum_vzniku`
5. CORS headers na všetkých odpovediach (vrátane error). OPTIONS preflight handler. Žiadny JWT verify potrebný — funkcia je bezpečná na anonymné volanie (read-only ARES proxy s rate-limitom cez cache).

`supabase/config.toml` doplniť ak treba:
```toml
[functions.lookup-ico]
verify_jwt = false
```

## Krok 3 — TypeScript typy

Súbor: `src/types/ares.ts`

```ts
export interface AresCompanyData {
  ico: string;
  obchodni_jmeno: string;
  dic: string | null;
  adresa: string;
  mesto: string;
  psc: string;
  ulice: string | null;
  pravni_forma: string;
  datum_vzniku: string; // ISO date
}

export interface AresLookupResponse {
  data?: AresCompanyData;
  source: 'cache' | 'ares';
  error?: string;
}
```

## Krok 4 — Reusable komponent `IcoLookupField`

Súbor: `src/components/tpv/dodavatelia/IcoLookupField.tsx`

Props:
```ts
interface Props {
  ico: string;
  onIcoChange: (v: string) => void;
  /** Volá sa keď ARES vráti dáta — parent doplní svoje form polia. */
  onLookup: (data: AresCompanyData) => void;
  disabled?: boolean;
}
```

Správanie:
- Input s `inputMode="numeric"`, `maxLength=8`, filter na číslice. Vedľa neho tlačidlo "Načítať z ARES" s ikonou `Search` z `lucide-react`.
- Tlačidlo: disabled ak IČO nemá 8 číslic alebo prebieha loading. V loading stave spinner `Loader2 animate-spin` + "Načítavam...".
- Klik → `supabase.functions.invoke('lookup-ico', { body: { ico } })`.
- Auto-trigger: `onBlur` na inpute spustí lookup ak má presne 8 číslic a IČO sa od posledného volania zmenilo (deduplikácia cez ref).
- Toasty (sonner):
  - Success cache: `toast.success("Údaje načítané", { description: "z cache" })`
  - Success ARES: `toast.success("Údaje načítané z ARES")`
  - 404: `toast.warning("IČO {ico} sa v registri ARES nenašlo. Vyplň údaje ručne.")`
  - 400: `toast.error("IČO musí mať presne 8 číslic")`
  - 503/network: `toast.error("ARES je momentálne nedostupné, skús neskôr alebo vyplň ručne.")`
- Style: existujúci dark theme + brand orange accent (#EA592A) ako focus ring na akčnom tlačidle, ladí so zvyškom dialógov.

## Krok 5 — Integrácia

**`AddSupplierDialog.tsx`** — nahraď samostatné pole IČO komponentom `IcoLookupField`. V `onLookup` callbacku:
```
setNazov(data.obchodni_jmeno)
setDic(data.dic ?? "")
setAdresa(data.ulice ? `${data.ulice}, ${data.psc} ${data.mesto}` : `${data.psc} ${data.mesto}`)
```
(Existujúci dialog má iba `adresa` ako voľný textový riadok — zložím adresu z ulice + PSČ + mesto. Polia ostanú editovateľné.)

**`OverviewPane.tsx`** — v edit móde nahraď IČO input rovnakým komponentom; `onLookup` aktualizuje `draft` (nazov, dic, adresa).

## Súbory

Nové:
- `supabase/migrations/<timestamp>_ares_cache.sql`
- `supabase/functions/lookup-ico/index.ts`
- `src/types/ares.ts`
- `src/components/tpv/dodavatelia/IcoLookupField.tsx`

Upravené:
- `src/components/tpv/dodavatelia/AddSupplierDialog.tsx`
- `src/components/tpv/dodavatelia/panes/OverviewPane.tsx`
- `supabase/config.toml` (ak treba `verify_jwt = false`)

## Bezpečnosť & výkon

- Edge function používa service role key iba server-side. Klient nikdy nemá write access na `ares_cache`.
- Negative caching (`not_found=true`) zabráni opakovaným ARES requestom pre neexistujúce IČO.
- TTL 30 dní. Index na `fetched_at` umožní budúcu cleanup úlohu (nie je súčasťou tohto kroku).
- Server-side fetch → žiadne CORS issues s ARES.
