

## Plán oprav Správy osob

### Problém #1 — Úsek/Pozice/Úvazek nejde měnit
Příčina: zaměstnanci mají v DB `stredisko=NULL, usek_nazov=NULL` (44 ze 45). Select s `value=""` v Radix UI nezavolá `onValueChange` a Pozice je disabled dokud `usek_nazov` není nastaven. Také `Select` neumí mít `<SelectItem value="">`.

Řešení:
- V `OsobyZamestnanci`: Select pro Úsek použije `value={emp.usek_nazov ?? "__none"}`, ignoruje hodnotu `__none` při změně. Pozici nedisabovat — když není úsek, ukázat select se všemi pozicemi (z celého katalogu) a při výběru pozice automaticky doplnit i úsek + středisko.
- Úvazek: vždy `value={String(emp.uvazok_hodiny ?? 8)}` — funguje, ale fallback na první aktivaci handleru zaručit přes `defaultValue`/kontrolovaný režim. (Důvod proč nejde — řádek je `opacity-50` při `isTerminated`, ale klikání by mělo fungovat. Reálně je problém že `aktivny=true` ale `usek_nazov=NULL` → řádek vypadá normálně, jen Selecty s `""` se nezachytí kliknutím v Radix.)

### Problém #2 — Kalendář absence pod Dialogem
Příčina: `EmployeeAbsenceDialog` používá Popover uvnitř Dialogu — Popover se renderuje do portálu, ale z-index Popoveru < z-index Dialog overlay.

Řešení: V `EmployeeAbsenceDialog` nahradit `<Popover>` + `<Calendar>` za vložený inline kalendář v dialogu (sekce „Od" / „Do" se rozbalí pod tlačítkem) — žádný portál, žádný z-index conflict. Současně přidat `Otevřeno (nahrát na neurčito)` checkbox vedle „Do" (už je dole, jen přesunout do gridu vedle Do pole pro lepší UX).

### Problém #3 — Externisti / Katalog: header bar nalepený
Příčina: header sekce používá `pb-3` ale chybí `pt-4`/`px-5`, a karta `Osoby.tsx` je `overflow-hidden` bez paddingu kolem tabu obsahu.

Řešení: Sjednotit hlavičky všech sub-tabů (`OsobyExternisti`, `OsobyKatalog`, `OsobyUzivatele`) na stejný pattern jako `OsobyZamestnanci`: `px-5 pt-4 pb-3 border-b` + flex layout titulek vlevo / akce vpravo.

### Problém #4 — Vizuální nekonzistence s Project Info / Analytics
Project Info nemá obalující bílou kartu uvnitř obsahu — tabulka je přímo plnostránková se stickou hlavičkou. Aktuálně `Osoby.tsx` má `max-w-[1400px] mx-auto` + bílou kartu uvnitř, což působí jako modal-on-page.

Řešení v `src/pages/Osoby.tsx`:
- Odstranit `max-w-[1400px]` constraint a vnitřní `bg-white rounded-lg border shadow-sm` kartu.
- Layout: hlavička stránky (titul + taby) → obsah plné šířky bez `p-6` (jen `flex-1 overflow-hidden`), tabulka jde od kraje ke kraji jako Analytics.
- Hlavička tabů přilepená k hornímu border-b stejně jako v ProjectInfo/Analytics.

### Problém #5 — Skladník/Údržbář v „Vedení výroby"
Řešení: migrace která rozdělí `Vedenie výroby` (Výroba Indirect) na 2 úseky:
- `Vedenie výroby` → Mistr, Vedúci výroby (zůstává)
- nový `Sklad a údržba` → Skladník, Údržbár (přesun)

### Problém #6 — Kapacita: duplicitní header + sub-tab Zaměstnanci
Aktuálně v `OsobyKapacita` je `<Tabs>` se 2 sub-taby (Kapacita / Zaměstnanci v týdnu). Uživatel řekl: zaměstnanci v týdnu duplikuje hlavní záložku Zaměstnanci.

Řešení: V `OsobyKapacita` odstranit Tabs a sub-tab „Zaměstnanci v týdnu". Renderovat pouze inline `CapacitySettings` (graf + složení útvarů + per-week composition toggle už je uvnitř CapacitySettings). Smazat nepoužívané hooky `useEmployeesForWeek` import a custom event listener.

### Soubory k úpravě
1. **Migrace SQL** — přesun Skladník/Údržbár do nového úseku `Sklad a údržba` (Výroba Indirect).
2. **`src/pages/Osoby.tsx`** — odstranit max-width constraint, odstranit vnitřní bílou kartu, plná šířka jako Analytics.
3. **`src/components/osoby/OsobyZamestnanci.tsx`** — opravit Select hodnoty (`__none` sentinel), umožnit výběr Pozice i bez úseku (auto-doplní úsek+středisko z katalogu).
4. **`src/components/production/EmployeeAbsenceDialog.tsx`** — nahradit Popover kalendáře inline kalendářem v dialogu.
5. **`src/components/osoby/OsobyExternisti.tsx`** — sjednotit hlavičku (`px-5 pt-4 pb-3`).
6. **`src/components/osoby/OsobyKatalog.tsx`** — sjednotit hlavičku (`px-5 pt-4 pb-3`).
7. **`src/components/osoby/OsobyUzivatele.tsx`** — pokud má vnořený Dialog, ověřit a sjednotit padding.
8. **`src/components/osoby/OsobyKapacita.tsx`** — odstranit Tabs wrapper a sub-tab Zaměstnanci, jen inline `<CapacitySettings inline />`.

