

## Rozsah

Riešime obe veci naraz:
- **Bod 1+2**: normalizácia `item_code` pri TPV matchu v recalc-i (oprava 0h pre Z-2607-008, Z-2617-001, Z-2604-004, Z-2601-004).
- **Bod 3**: zrušiť modifikáciu `item_code` v drag/drop kóde — duplicita sa rieši cez `id` / `split_group_id`, nie cez suffix.

## Zmena 1 — `useProductionDragDrop.ts`: nepridávať suffix do `item_code`

V `src/hooks/useProductionDragDrop.ts` sú 2 miesta (cca r. 337–340 a r. 566–570) kde sa pri konflikte alebo „separate" móde generuje:

```ts
item_code: `${original}_${Date.now().toString(36)}`
```

Nahradiť: ponechať `item_code` **nezmenený**. Unikátnosť riadku je už zaručená cez `id` (uuid) v DB; UI kľúče v Reacte používajú `id`, nie `item_code`. Split chain rozlíšenie ide cez `split_group_id` + `split_part`.

Ak by niekde existovala DB unique constraint na `(project_id, item_code)` v `production_inbox` alebo `production_schedule` — overím pred zmenou cez `code--search_files` a `supabase--read_query`. Ak existuje, treba ju zmeniť na `(project_id, item_code, split_group_id)` alebo úplne odstrániť (split parts toho istého kódu sú legitímne).

## Zmena 2 — `recalculateProductionHours.ts`: normalizácia (defenzívne, pre staré dáta)

Aj keď nový kód už nebude generovať suffixy, **existujúce inbox riadky v DB ich majú** (Z-2607-008: 33ks, Z-2617-001: 5ks, atď.). Preto pridať helper na čítanie:

```ts
function normalizeItemCode(code: string | null | undefined): string {
  if (!code) return "";
  return code.replace(/_[a-z0-9]{4,8}$/i, "");
}
```

Použiť na 4 miestach v `recalculateProductionHours.ts`:
1. Build `activePartsByCode` — kľúč = `normalizeItemCode(it.item_code)`.
2. Schedule loop TPV lookup — `tpvItems.find(t => t.item_code === normalizeItemCode(item.item_code))`.
3. Inbox loop TPV lookup — to isté.
4. Schedule loop `activePartsByCode.get(normalizeItemCode(item.item_code))`.

## Zmena 3 — `splitChainHelpers.ts`: rovnaká normalizácia pri groupovaní

V `renumberChain` groupuje rows podľa `item_code`. Pridať `normalizeItemCode` aj tu, aby chain badges (1/N) ostali konzistentné medzi originálnym kódom a starými suffixovanými variantmi.

## Migrácia existujúcich dát (jednorazovo)

SQL migrácia ktorá vyčistí staré suffixy v DB:

```sql
UPDATE production_inbox
SET item_code = regexp_replace(item_code, '_[a-z0-9]{4,8}$', '', 'i')
WHERE item_code ~ '_[a-z0-9]{4,8}$';

UPDATE production_schedule
SET item_code = regexp_replace(item_code, '_[a-z0-9]{4,8}$', '', 'i')
WHERE item_code ~ '_[a-z0-9]{4,8}$' AND is_midflight = false;
```

Midflight rows ostávajú nedotknuté (historické).

Po migrácii aj normalizačný regex v kóde zostáva (defenzívne pre prípadné zvyškové dáta).

## Po nasadení

1. Spustiť SQL migráciu (cleanup suffixov).
2. Spustiť **„Přepočítat → Vše vč. historie"** v PlanVyroby.
3. Overiť:
   - **Z-2607-008** Inbox: súčet aktívnych TPV položiek = 586h.
   - **Z-2617-001** Inbox: TPV-mapované položky dostanú svoje hodiny (T.01=62h, T.03=36h, T.04=124h, T.05=67h, T.06=8h).
   - **Z-2604-004 / Z-2601-004**: každý 4h, 2200 Kč (orphan fallback).
4. Otestovať drag/drop konflikt scenár: presunúť inbox položku do týždňa kde už je rovnaký `item_code` → zvoliť „separate" → overiť že nový schedule riadok má **rovnaký** `item_code` a `split_group_id` ich rozlišuje.

## Dotknuté súbory

- `src/hooks/useProductionDragDrop.ts` — odstrániť suffix generovanie (2 miesta).
- `src/lib/recalculateProductionHours.ts` — pridať `normalizeItemCode`, použiť pri TPV lookup a `activePartsByCode`.
- `src/lib/splitChainHelpers.ts` — `normalizeItemCode` pri groupovaní chain rows.
- Nová migrácia: cleanup suffixov v `production_inbox` + `production_schedule` (non-midflight).
- Pred migráciou overiť unique constraints na `item_code` v oboch tabuľkách a prípadne ich upraviť.

