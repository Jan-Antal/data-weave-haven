
Cieľ: zjednodušiť tabuľku Zamestnanci v záložke Zamestnanci tak, aby existoval len jeden hlavný header riadok, ktorý je sticky na vrchu obsahu, namiesto opakovaného header riadku pri každom úseku.

Súčasný stav (`src/components/osoby/OsobyZamestnanci.tsx`):
- Každý úsek vo vnútri stredisko bloku má vlastnú `<Table>` s `<TableHeader>` (Meno, Úsek, Pozícia, Role, Úvazek, Absencie, Akcie).
- Pri viacerých úsekoch sa header vizuálne opakuje a vytvára šum.

Návrh:
1. Jeden globálny header riadok
   - Pridať jediný header riadok nad celý zoznam blokov.
   - Stĺpce: Meno · Úsek · Pozícia · Role na projektu · Úvazek · Absencie · Akcie.
   - Šírky stĺpcov zafixovať cez `<colgroup>` / inline width, aby všetky riadky vo všetkých blokoch sedeli pod hlavným headerom.
2. Sticky správanie
   - Header bude `position: sticky; top: 0` v rámci scroll kontajnera tabu.
   - Background `var(--color-background-secondary)`, border-bottom 0.5px, z-index nad obsahom ale pod globálnou hlavičkou aplikácie.
3. Bloky stredisko + úsek sub-headers ostávajú
   - Stredisko block header (zelený / oranžový / fialový / sivý) zostáva nezmenený.
   - Úsek sub-header riadok (názov úseku + prípadný `→ PM/Konštruktér/Kalkulant` tag) zostáva ako oddeľovač skupín, ale už NEobsahuje opakovaný stĺpcový header.
4. Riadky zamestnancov
   - Renderovať priamo ako `<TableRow>` v jednej tabuľke per blok bez vlastného `<TableHeader>`, s rovnakým `<colgroup>` ako hlavný header, aby stĺpce zarovnali.
   - Žiadne zmeny v inline editácii (Úsek, Pozícia, Role, Úvazek), v badge štýloch ani v akciách.

Čo sa NEMENÍ:
- Funkčnosť (mutácie, dialógy, absencie, role toggles).
- Farby blokov stredisko (Direct zelená, Indirect oranžová, Provoz fialová, Nepriradené sivá).
- Inline „hover-to-reveal" štýl selectov.
- Dáta a filtrovanie.

Súbor na úpravu:
- `src/components/osoby/OsobyZamestnanci.tsx`
