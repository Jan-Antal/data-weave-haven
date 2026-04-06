

# Oprava pádu preview + cache extrahovaných položek

## Problémy

1. **Preview pad při přepnutí sheetu** — DocumentPreviewModal používá SharePoint iframe (`previewUrl`). Při interakci uvnitř iframe (přepnutí sheetu) může dojít k chybě, která zavře celý dialog včetně extrahovaných položek.

2. **Extrahované položky se ztrácejí** — useEffect na `open` resetuje vše (`setItems([])`) → pokud dialog spadne nebo se zavře, musím extrahovat znovu = zbytečný AI request.

## Řešení

### 1. Oddělení preview od hlavního dialogu (oprava pádu)

Preview (DocumentPreviewModal) se už renderuje mimo hlavní Dialog, ale problém je, že při chybě v preview se propaguje chyba a může resetovat stav. Řešení:
- Obalit DocumentPreviewModal do **Error Boundary** — pokud iframe spadne, chytíme to a zobrazíme fallback místo pádu celé komponenty
- Při zavření preview se nic neresetuje (už teď by nemělo, ale ověříme)

### 2. In-memory cache extrahovaných položek (15 min TTL)

Přidat **module-level cache** (mimo komponentu) indexovanou podle `projectId`:

```text
extractionCache: Map<string, {
  items: ExtractedItem[],
  fileName: string,
  sourceDoc: {...},
  timestamp: number
}>
```

**Logika:**
- Po úspěšné extrakci → uložit do cache
- Při otevření dialogu → zkontrolovat cache:
  - Pokud existuje záznam pro `projectId` a je < 15 min starý → načíst z cache, přeskočit na "done"
  - Pokud je starší nebo neexistuje → normální flow (search → extract)
- Při extrakci nového dokumentu → přepsat cache
- Cache se **nevymaže** při zavření dialogu

**Reset cache:**
- Po úspěšném uložení (handleSave) → smazat cache pro projekt
- Po 15 minutách automaticky (kontrola při otevření)

### 3. Úprava useEffect reset logiky

Při zavření dialogu (`open = false`) **neresetovat items a sourceDoc** — ty zůstanou v module-level cache. Resetovat pouze UI stav (selection, preview, saving).

## Soubory

1. **`src/components/assistant/TPVExtractor.tsx`**
   - Přidat `extractionCache` (Map) na úrovni modulu
   - Upravit useEffect: při open zkontrolovat cache → pokud platný, rovnou `setItems` + `setPhase("done")`
   - Po extrakci uložit do cache
   - Po handleSave smazat cache
   - Obalit DocumentPreviewModal do try/catch error boundary

