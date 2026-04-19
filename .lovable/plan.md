

## Diagnóza (potvrdená z DB)

Z-2617-001:
- `hodiny_plan` = 1214 h (zo `project_plan_hours`)
- Midflight schedule = 4 týždne × ~19 h = **77.8 h** ✓
- Inbox = 6 položiek (T.01–T.06, `Schváleno`) = **1136.2 h** ❌ nadhodnotené
- Súčet = 77.8 + 1136.2 = 1214 h (matematika reconciliation sedí, ale rozdelenie je nesprávne)

V TPV je **40+ položiek**, len 6 z nich má status `Schváleno` a je v Inboxe. Zvyšných ~34 položiek (`Připraveno ke zpracování`, `Zpracovává se`, `Připomínky`, atď.) ešte nikto neposlal do výroby. Reconciliation algoritmus rozdelil **celých 1136 h zvyšku plánu** len medzi týchto 6 schválených položiek → každá dostala 5× viac hodín než reálne reprezentuje (T.04 = 405 h, T.01 = 202 h…).

## Príčina

V `midflightImportPlanVyroby.ts` reconciliation step:
```
inboxRemainder = hodiny_plan − Σ midflight
distribuuj inboxRemainder medzi VŠETKY pending Inbox položky proporcionálne podľa estimated_czk
```

Algoritmus implicitne predpokladá, že **Inbox = celý zvyšok projektu**. To platilo pre Z-2515-001 (kde 30 inbox položiek pokrývalo celé TPV), ale **neplatí všeobecne** — keď v TPV existujú schválené položky aj nezschvátlené, Inbox má len časť projektu.

## Riešenie

Reconciliation musí **rešpektovať reálny pomer Inbox vs. celé TPV**. Inbox dostane len svoj **proporcionálny podiel** zo zvyšku plánu, nie celý zvyšok.

### Nový algoritmus per projekt

1. `H_mf` = Σ midflight hodín
2. `inboxRemainder = max(0, hodiny_plan − H_mf)`
3. **Načítať CZK všetkých nezrušených TPV položiek projektu** (`Σ tpv_czk_total`).
4. **Načítať CZK Inbox položiek** (`Σ inbox_czk`) a **CZK pending TPV položiek** (`Σ pending_tpv_czk`) — t.j. tých, čo NIE SÚ v Inboxe ani už zaplánované/expedované.
5. **Inbox podiel** = `inboxRemainder × inbox_czk / (inbox_czk + pending_tpv_czk)`.
   - Tzn. zvyšok plánu sa rozdelí pomerne medzi to, čo je už v Inboxe, a to, čo ešte v TPV čaká na schválenie.
6. Distribuovať `Inbox podiel` medzi inbox položky proporcionálne podľa `estimated_czk` (last item absorbuje rounding remainder).
7. Split metadáta a `split_total = N + M` zostávajú ako predtým.

### Edge cases

- **Žiadne pending TPV (všetko schválené alebo zrušené)**: Inbox dostane celý `inboxRemainder` — pôvodné správanie zachované, Z-2515-001 funguje rovnako.
- **`inbox_czk + pending_tpv_czk = 0`**: skip, žiadna distribúcia.
- **TPV položky bez ceny**: ignorujú sa v sumách.

### Očakávaný výsledok pre Z-2617-001

- `inbox_czk` ≈ 922k Kč (6 schválených položiek)
- `pending_tpv_czk` ≈ ostatných ~34 položiek (väčšina cien ~50–200k) → cca 2.5–3M Kč
- Inbox podiel z 1136 h = **~270–300 h** rozdelených medzi 6 položiek namiesto plných 1136 h
- Zvyšok ~830 h zostane "rezervovaný" v pláne pre nezschvátlené TPV položky (žiadny Inbox/schedule záznam, plán to drží implicitne cez `hodiny_plan`)

### Súbor

`src/lib/midflightImportPlanVyroby.ts` — v reconciliation bloku (po midflight inserte):
- pridať batch fetch `tpv_items` pre dané projekty (nezrušené, status ≠ "Zrušeno"),
- spočítať `pending_tpv_czk` ako Σ ceny položiek, ktoré nie sú v `production_inbox` (match cez `item_code`) ani v `production_schedule` (match cez `item_code`),
- prepočítať `inbox_share` namiesto použitia plného `inboxRemainder`.

### Postup užívateľa

1. AI nasadí kód.
2. Klikni **📥 Midflight import** (re-distribuuje Inbox správne).
3. Over Z-2617-001: Inbox 6 položiek ≈ 270–300 h (namiesto 1136 h).

