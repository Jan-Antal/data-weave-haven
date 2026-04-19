
Cieľ: vizuálne lepšie oddeliť jednotlivé strediská (Výroba Direct, Výroba Indirect, Provoz, Nepriradené) a Externistov ako samostatné „bloky" tabuľky, aby každé stredisko pôsobilo ako vlastná karta s úsekmi vnútri, namiesto plynulého zoznamu riadkov.

Súčasný stav
- `OsobyZamestnanci.tsx`: jeden veľký scroll s jedným sticky headerom; stredisko aj úsek sú len farebné riadky cez `colSpan`, opticky splývajú s ostatnými riadkami.
- `OsobyExternisti.tsx`: rovnaký princíp – jeden tyrkysový header riadok + ploché riadky.

Návrh – „card block" pre každé stredisko
1. Wrapper karta per stredisko
   - Každé stredisko (Direct / Indirect / Provoz / Nepriradené / Externisté) zabaliť do `<section>` s:
     - `rounded-lg border` v farbe stredisko (zelená / oranžová / fialová / sivá / cyan)
     - jemný `shadow-sm`, `overflow-hidden`
     - `mb-4` medzera medzi blokmi
   - Karty budú vizuálne oddelené prázdnym priestorom + vlastným orámovaním → jasné „bloky".

2. Hlavička bloku (stredisko)
   - Plná farebná lišta na vrchu karty (existujúce farby: `EAF3DE` / nová oranžová pre Indirect / `EEEDFE` / sivá / `cyan-50`).
   - Obsahuje: badge so stredisko názvom, počet osôb, súčet hodín.
   - Žiadne `colSpan` cez tabuľku – je to čistý `div` nad tabuľkou.

3. Vnútro bloku
   - Jedna `<table>` per blok so sticky-like column headerom:
     - Stĺpcový header (Meno · Úsek · Pozícia · Role · Úvazek · Absencie · Akcie) sa zobrazí raz na vrchu prvého bloku ako globálny sticky header (ostáva ako dnes).
     - Vo vnútri každého bloku už hlavičku stĺpcov neopakovať.
   - Úseky vo vnútri bloku oddeliť sub-headerom:
     - Riadok `bg-muted/40`, `text-[11px] uppercase tracking-wide`, jemný `border-y`
     - Obsah: názov úseku · počet osôb · hodiny
   - Riadky zamestnancov bez zmeny štýlu (inline edit, hover-to-reveal).

4. Externisté
   - Rovnaký princíp: jedna karta s cyan hlavičkou, vnútri jeden zoznam (bez sub-úsekov).

5. Sticky header stĺpcov
   - Globálny sticky header nad prvým blokom zostáva (Meno / Úsek / …). Šírky stĺpcov zafixovať cez `<colgroup>` zdieľaný medzi headerom a každým blokom, aby zarovnanie sedelo.

Čo sa NEMENÍ
- Funkčnosť (mutácie, inline edit, dialógy, absencie, role).
- Farebná paleta stredisko + Externistov.
- Triedenie a filtrovanie.

Súbory na úpravu
- `src/components/osoby/OsobyZamestnanci.tsx` – rozdeliť render do kariet per stredisko, pridať wrapper `<section>` a sub-header pre úseky.
- `src/components/osoby/OsobyExternisti.tsx` – zabaliť do rovnakej karty, aby vizuálne ladila so Zamestnancami.
