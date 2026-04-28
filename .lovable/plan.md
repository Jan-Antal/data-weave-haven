## Problém

Karty Gradus Kampa vo Forecast prehľade ukazujú nezmyselné čísla:
- **Zelená INBOX karta**: `810h` / "2 položky" — v DB je len 145.9h v pending inboxe
- **Oranžová AI karta**: `~255h` / "12 položek" — správny zostatok je ~954h

### Príčina

1. **Forecast je kešovaný v localStorage** (`ami_forecast_session`) a regeneruje sa len ručne (tlačidlo "Generate" / "Reset").
2. Keď v pozadí prebehol nový **auto-fill blockerov** (pred. krok, `useBlockerAutoReduce`):
   - Zmazal 2× rezervu 256h, presunul položky z inboxu do schedule.
   - Tým sa zmenili reálne čísla v DB (`production_inbox`, `production_schedule`).
3. Ale forecast karty sa **nepregenerovali** → ukazujú snapshot stavu spred auto-fillu (vrátane už neexistujúcich rezerv, ktoré sčítaval do 810h aj 255h).
4. Naviac: 12 historických **midflight rows** (`is_midflight=true`, `Gradus Kampa — T45..T13`, spolu 233.4h, `completed_at` nastavený) sú legitímny záznam o už hotovej práci — ale forecast ich rátal ako "už naplánované", takže AI estimate vyšla nízka.

### Reálny stav v DB (overenené)
- Plán projektu: **1334h** (12 TPV položiek)
- Hotové (midflight): **233.4h**
- V inbox pending: **145.9h** (AT.01=107h + AT.06=38.9h)
- Zostáva odhadnúť: ~**954.7h**

## Riešenie

### 1. Invalidovať forecast cache, keď sa DB zmení v pozadí

V `src/hooks/useForecastMode.ts` pridať listener, ktorý keď je forecast aktívny a `production_inbox` alebo `production_schedule` query sa invalidne (napr. po `useBlockerAutoReduce`), automaticky:
- Zobrazí jemný banner: *"Data sa zmenili — kliknite 'Reset' pre prepočet"*
- ALEBO automaticky zavolá `resetAndRegenerate()` ak je to bezpečné

Najjednoduchšie a najmenej invazívne: **pri auto-fille zavolať `clearStorage()` pre obidva forecast módy a invalidovať aj forecast query** v `useProductionInbox.ts` na konci úspešného auto-fillu.

### 2. Pridať tlačidlo "Vyčistiť cache forecast"

Tlačidlo v forecast paneli (alebo automaticky pri otvorení), ktoré:
- Premaže `localStorage.ami_forecast_session` a `ami_forecast_session_scratch`
- Pretiahne čerstvé bloky z edge funkcie

### 3. (Voliteľné) Banner upozornenia pri stale dátach

Pri načítaní uloženej session porovnať `timestamp` s `updated_at` najnovšieho riadku v inboxe/schedule pre dotknuté projekty. Ak je session staršia → ukáže červený banner "Forecast je zastaralý, regenerovať".

## Akcia teraz pre používateľa

Aby sa z UI okamžite zbavil zlých čísel pre Gradus Kampa:
- Stlačiť tlačidlo **"Reset"** vo Forecast móde (alebo zavrieť a otvoriť forecast)
- Tým sa cache premaže a edge funkcia vráti správne hodnoty (~954h AI estimate, ~146h INBOX)

## Súbory na úpravu

- `src/hooks/useProductionInbox.ts` — po úspešnom auto-fille volať `localStorage.removeItem("ami_forecast_session")` aj `_scratch`
- `src/hooks/useForecastMode.ts` — pridať detekciu staleness (timestamp porovnanie pri `loadFromStorage`); ak data v DB sú novšie → ignorovať saved session a vyžiadať regeneráciu

## Čo NEriešiť

- Midflight rows (`is_midflight=true`) sú v poriadku — sú to historické záznamy hotovej práce, NEsmažú sa.
- Inbox položky AT.01 (107h) a AT.06 (38.9h) sú správne — sú to zostatky po midflight reconciliation.
- Existujúci auto-fill blockerov funguje správne.
