
## Oprava Výkresů v modulu Výroba

### Cíl
V sekci **Dokumentace → Výkresy** v modulu **Výroba** se musí vždy zobrazovat soubory jen pro aktuální `project_id` ze složky:

```text
/{ProjectID}/Vykresy/
```

Počet v tlačítku `📄 Výkresy (x)` se má brát z optimalizační cache `sharepoint_document_cache.category_counts.vykresy`, stejně jako v detailu projektu.

### Pravděpodobná příčina chyby
Hook `useSharePointDocs(projectId)` si drží vnitřní stav `filesByCategory` a `fetchedRef`. Když uživatel ve Výrobě přepne projekt, komponenta může zůstat stejná, ale změní se `projectId`.

Tím pádem:
- seznam výkresů může zůstat z předchozího projektu,
- `fetchedRef` může říct „vykresy už byly načtené“ a přeskočit nový fetch,
- uživatel pak vidí stejný výkres u více projektů.

### Implementace

#### 1. Reset dokumentového stavu při změně projektu
V `src/hooks/useSharePointDocs.ts` doplním `useEffect`, který při změně `projectId`:

- nastaví `filesByCategory` na `globalFileCache[projectId] ?? {}`,
- vyčistí `fetchedRef`,
- vyčistí loading stav,
- nastaví cache timestamp pro nový projekt.

Tím se zabrání tomu, aby se výkresy z předchozího projektu propsaly do dalšího projektu.

#### 2. Vynutit oddělení instance Výkresů podle projektu
V `src/pages/Vyroba.tsx` upravím render:

```tsx
<VykresynSection
  key={project.projectId}
  projectId={project.projectId}
  cachedDocCount={cachedDocCount}
/>
```

Tím React při změně projektu vytvoří novou instanci sekce Výkresů a nepřenese starý stav otevření/seznamu.

#### 3. Počet zobrazovat primárně z cache úložiště
V `VykresynSection` nastavím logiku počtu takto:

- pokud máme `cachedDocCount` z `category_counts.vykresy`, použije se ten,
- pokud cache chybí a soubory už byly načtené živě, použije se `files.length`,
- jinak se zobrazí `0`.

Tedy tlačítko bude respektovat uložený optimalizační počet, ne náhodný živý stav jiné instance.

#### 4. Načítat živé Výkresy až pro správný projekt
Upravím efekt v `VykresynSection`, aby při načítání volal výhradně:

```ts
listFiles("vykresy", true)
```

pro aktuální `projectId`.

`force = true` zajistí, že se při změně projektu nepoužije starý `fetchedRef`.

#### 5. Ukládat výsledek složky Výkresy zpět do cache
V `useSharePointDocs.listFiles()` doplním po úspěšném načtení jedné kategorie uložení do `sharepoint_document_cache` tak, aby:

- aktualizovalo `file_list.vykresy`,
- aktualizovalo `category_counts.vykresy`,
- přepočítalo `total_count` jako součet kategorií,
- nepřepsalo ostatní kategorie prázdným objektem.

Tím bude Výroba i Project detail číst stejný poslední známý stav.

#### 6. Zachovat správnou složku
Nebudu měnit mapování kategorie, protože už je správně:

```ts
vykresy: "Vykresy"
```

Pouze zajistím, že se nikdy nepoužije starý `projectId`.

### Soubory
- `src/hooks/useSharePointDocs.ts`
- `src/pages/Vyroba.tsx`
- případně aktualizace paměti `mem://features/production-tracking/drawing-and-document-previews`

### Výsledek
- Ve Výrobě se u každého projektu zobrazí pouze jeho vlastní výkresy.
- Kliknutí na výkres otevře správný soubor z aktuálního projektu.
- Počet `📄 Výkresy (x)` se bude brát z uložené cache `category_counts.vykresy`.
- Živý fetch složky `Vykresy` po načtení aktualizuje cache, aby se Project detail i Výroba držely ve stejném stavu.
