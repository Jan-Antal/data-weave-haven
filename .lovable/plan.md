Zjistil jsem dva pravděpodobné problémy:

1. Pokud jsou v Průvodce zároveň neschválené položky a chybí Expedice, teď se ukáže jen dialog „Prvky nejsou schváleny“. Po kliknutí „Přesto tisknout“ se rovnou tiskne, takže uživatel nedostane možnost datum dopsat.
2. Výběr data v popupu může být schovaný/nepoužitelný kvůli z-indexu kalendáře uvnitř dialogu. V jiných částech aplikace má kalendář `z-[99999]`, tady ne.

Plán opravy:

1. Upravit tok tlače Průvodky
   - Tisk bude vždy kontrolovat obě věci v jasném pořadí:
     - neschválené položky,
     - chybějící termín Expedice.
   - Když uživatel potvrdí neschválené položky a Expedice chybí, otevře se následně dialog pro ruční zadání termínu místo přímého tisku.

2. Zlepšit dialog „Chybí termín expedice“
   - Opravit kalendář tak, aby byl nad dialogem a šel normálně vybrat datum.
   - Nechat tři volby:
     - „Tisknout s termínem“ po výběru data,
     - „Tisknout bez termínu“,
     - „Zrušit“.
   - Přidat jasnější text, že ručně zadané datum platí jen pro tento tisk a neukládá se do zakázky.

3. Opravit existující upozornění při neschválených položkách
   - Pokud Expedice chybí, upozornění nebude tvrdit jen „lze doplnit ručně“, ale po potvrzení skutečně otevře zadání data.

4. Sjednotit formátování termínu
   - Použít existující app date parser (`parseAppDate`) i v PDF exportu, aby se správně načetly formáty jako `02-Jul-26`, `29. 4. 2026`, `3/2/26`, ISO datum atd.
   - Výstup v Průvodce zůstane přesně `Exp. DD.MM.YY`.

5. Ověření po úpravě
   - Prověřím minimálně tyto scénáře v kódu a rychlým runtime testem helperu:
     - projekt s Expedicí vytiskne `Exp. DD.MM.YY`,
     - projekt bez Expedice otevře popup,
     - ručně vybrané datum se propíše do náhledu Průvodky,
     - „Tisknout bez termínu“ nechá pole prázdné,
     - neschválené položky + chybějící Expedice vedou nejdřív přes varování a potom přes datumový dialog.

Technické detaily:
- Úpravy budou v `src/components/TPVList.tsx` a `src/lib/exportPdf.ts`.
- Nebudou potřeba změny databáze.
- Mobilní TPV zůstane beze změny, protože aktuálně tlačítko Průvodka existuje v desktopové TPV tabulce.