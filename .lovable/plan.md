
## Plán implementace: Bundle labeling systém pro Plán výroby

### Cíl
Doplnit do **Plánu výroby** stabilní označování bundlů přes `Bundle A`, `Bundle B`, atd., oddělené podle:

```text
project_id + stage_id + bundle_label
```

Splitované části zůstanou napojené na stávající mechanismus:

```text
split_group_id + split_part + split_total
```

Nově se ale budou zobrazovat jako:

```text
Etapa 1 · Bundle A
Etapa 1 · Bundle A 1/3
Etapa 2 · Bundle A
```

---

## 1. Databázová migrace

Upravím tabulku `production_schedule`:

```sql
ALTER TABLE public.production_schedule
ADD COLUMN bundle_label text,
ADD COLUMN bundle_type text;

ALTER TABLE public.production_schedule
ADD CONSTRAINT production_schedule_bundle_type_check
CHECK (bundle_type IS NULL OR bundle_type IN ('full', 'split'));
```

### Backfill existujících dat
Aby se neztratilo aktuální plánování, doplním hodnoty pro existující řádky:

- řádky se `split_group_id` nebo `split_part/split_total` dostanou `bundle_type = 'split'`
- ostatní aktivní řádky dostanou `bundle_type = 'full'`
- `bundle_label` se doplní po skupinách `project_id + stage_id`
- historické split chainy zůstanou zachované přes `split_group_id`

Backfill bude navržen tak, aby:
- neměnil `production_inbox`
- neměnil `production_expedice`
- neměnil analytics ani modul Výroba
- nemazal ani nepřepisoval existující split chainy

---

## 2. Sdílené helpery pro bundle labely

Přidám helper logiku, pravděpodobně do nového nebo existujícího produkčního helper souboru:

```text
getNextBundleLabel(projectId, stageId)
resolveBundleType(row)
validateBundleDrop(source, target)
```

Pravidlo pro další písmeno:

```text
A → B → C → ... → Z
```

Kontrola bude hledat použité `bundle_label` napříč všemi týdny pro stejné:

```text
project_id + stage_id
```

---

## 3. Načítání dat v useProductionSchedule

V `src/hooks/useProductionSchedule.ts` rozšířím `ScheduleItem`:

```ts
bundle_label: string | null;
bundle_type: "full" | "split" | null;
```

A při mapování dat doplním fallback:

```text
pokud bundle_label chybí → dočasně použít legacy fallback podle split_group_id / project_id
pokud bundle_type chybí → odvodit z split_part/split_total
```

Tím bude UI bezpečné i pro starší řádky nebo případné nekompletní importy.

---

## 4. Drag & drop pravidla

Upravím `src/hooks/useProductionDragDrop.ts` a navazující volání z `src/pages/PlanVyroby.tsx`.

### Inbox → týden
Při přesunu z Inboxu do týdne:

#### Prázdný týden pro projekt + etapu
Vytvoří se nový bundle:

```text
bundle_label = A / další volné písmeno
bundle_type = full
split_part = NULL
split_total = NULL
```

#### Drop vedle existujícího bundlu
Vytvoří se nový bundle s dalším písmenem:

```text
Bundle B, Bundle C...
```

#### Drop do existujícího bundlu
Položka zdědí:

```text
bundle_label cílového bundlu
bundle_type cílového bundlu
```

### Stage isolation
Přidám validaci:

```text
Položky rôznych etáp nie je možné spájať
```

Drop mezi různými `stage_id` se zablokuje.

---

## 5. Split pravidla

Upravím:

- `src/components/production/SplitBundleDialog.tsx`
- `src/components/production/SplitItemDialog.tsx`
- `src/components/production/AutoSplitPopover.tsx`

Při splitu:

```text
Bundle A v T17
→ Bundle A 1/2 v T17
→ Bundle A 2/2 v T18
```

Změny při splitu:

```text
bundle_label zůstává stejné
bundle_type = split
split_group_id zůstává / vzniká stávajícím mechanismem
split_part/split_total se dál počítá stávající renumber logikou
```

---

## 6. Validace při spojování a přesunech

Doplním pravidla:

### Nelze míchat full a split
```text
Celé položky nie je možné pridať do split bundlu
Split položky nie je možné pridať do celého bundlu
```

### Split lze spojit jen v rámci stejné série
Povoleno:

```text
Bundle A 1/2 → Bundle A 2/2
```

Zakázáno:

```text
Bundle A 1/2 → Bundle B 1/2
```

Toast:

```text
Rôzne split série nie je možné spájať
```

### Sloučení posledních dvou částí
Pokud se spojí poslední dvě části jedné split série:

```text
bundle_type = full
split_group_id = NULL
split_part = NULL
split_total = NULL
```

A vznikne nový bundle s dalším volným písmenem:

```text
Položka zlúčená — vytvorený nový Bundle B
```

---

## 7. UI v Kanban týdenních silech

Upravím `src/components/production/WeeklySilos.tsx`.

Aktuální karta projektu seskupuje vše podle projektu. Nově uvnitř projektu seskupím položky podle:

```text
stage_id + bundle_label + split_part
```

Zobrazení:

```text
Z-2515-001 · RD Cigánkovi Zlín

Etapa 1 · Bundle A ───── 84h
  T01 Kuchyň      76h
  T02 Ostrůvek     8h

Etapa 1 · Bundle A 1/3 ─ 30h
  T08 Skříň       30h

Etapa 2 · Bundle A ───── 45h
  K01 Pracovní deska 45h
```

### Vizuální pravidla
Bundle header bude obsahovat:

- název etapy, pokud má projekt více etap
- `Bundle A`
- split badge `1/3`, pokud jde o split
- celkové hodiny této části bundlu
- barevný levý akcent podle písmena:
  - A = modrá
  - B = zelená
  - C = amber
  - D = fialová
  - další písmena cyklicky

Split badge:

```text
amber = není poslední část
green = poslední část
```

Zelený `ks` badge zůstane u jednotlivých položek a nebude se míchat se split označením.

---

## 8. Table view / plánovací dialog

Upravím také místa, kde se vkládá do `production_schedule` mimo Kanban:

- `src/components/production/PlanVyrobyTableView.tsx`
- `src/components/production/InboxPlanningDialog.tsx`

Aby plánování přes tabulku i dialog používalo stejná pravidla:

```text
nový bundle → další písmeno
splitované plánování → bundle_type = split
jedna položka bez splitu → bundle_type = full
```

---

## 9. Co zůstane beze změny

Nebudu měnit:

- `production_inbox`
- `production_expedice`
- analytics logiku
- modul Výroba
- stávající `split_group_id / split_part / split_total` mechanismus

Tyto části pouze načtou nové údaje, pokud je už poskytuje `production_schedule`, ale jejich workflow zůstane stejné.

---

## 10. Ověření

Po implementaci ověřím:

- nový drag z Inboxu vytvoří `Bundle A`
- další samostatný drop vytvoří `Bundle B`
- drop do existujícího bundlu zdědí `bundle_label`
- split `Bundle A` zobrazí `Bundle A 1/2`, `Bundle A 2/2`
- nejde spojit rozdílné etapy
- nejde míchat full a split bundle
- split série A nejde spojit se sérií B
- poslední dvě části splitu se umí vrátit na nový full bundle
- Kanban UI zobrazuje bundle hlavičky a `ks` badge zůstává zelený u položek
- build projde bez TypeScript chyb
