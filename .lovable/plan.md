

## Plán: Vyčistit 2025 a opravit auto-recalc pro 2026+

### 1) Smazat všechna data roku 2025
Migrace, která jednorázově odstraní:
- `production_capacity` WHERE `week_year = 2025` (všechny řádky, i manuální overrides — rok nás nezajímá)
- `production_capacity_employees` WHERE `week_year = 2025` (kompoziční snapshoty)

Absence v `ami_absences` necháváme být — používají se jako zdroj pravdy pro výpočet kapacity 2026+.

### 2) Oprava auto-recalc v `CapacitySettings.tsx`
Současný stav: `hasAutoRecalced` je jednorázový boolean → po prvním otevření Kapacity se už znovu nespustí, ani při změně roku.

Změna:
- Nahradit `useRef<boolean>` za `useState<Set<number>>` evidující roky, pro které už auto-recalc proběhl v této session.
- `useEffect` na `selectedYear` → pokud rok není v setu, spustit `triggerAutoRecalc()` a přidat ho.
- Tím se 2026 (a každý další rok, na který uživatel přepne) automaticky doplní/přepočítá z aktuálního stavu zaměstnanců + sviatků + absencí z `ami_absences`.

### 3) Ochrana proti budoucímu „zploštění"
Drobná pojistka v `handleRecalculateAll`: ujistit se, že upsert vždy zapisuje aktuálně spočítané `holiday_name`, `working_days`, a `is_manual_override = false` (nepřepisovat existující manual overrides). Logika už to dělá — jen ověřím v kódu, ať to při refactoru nevypadlo.

### Soubory
- **Migrace** (delete-only): smazání 2025 řádků z `production_capacity` a `production_capacity_employees`.
- **`src/components/production/CapacitySettings.tsx`** — změna `hasAutoRecalced` na set per-year + useEffect na `selectedYear`.

### Výsledek
- 2025 z DB zmizí kompletně.
- Při otevření Kapacity 2026 (a každém dalším roku) se automaticky přepočítají hodiny ze sviatků + zaměstnanců + absencí — graf bude zase kolísat tak jak má.
- Žádné jiné změny logiky ani UI.

