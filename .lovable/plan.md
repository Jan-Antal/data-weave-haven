
## Plán opravy Inbox logiky po „Vrátit do TPV“

### Cíl
Vrátím správné chování Inboxu v Plánu Výroby:

1. Projekt, který má ještě nějakou položku v TPV a zbytek je už ve výrobě, má zůstat v horní části Inboxu jako „chybí položka“.
2. Do spodní části Inboxu „Naplánováno“ mají padat jen projekty, které už mají všechny TPV položky přijaté do výroby / naplánované, ale ještě nejsou celé dokončené.
3. Projekty, které už mají všechno vyrobeno, mají z Inboxu úplně zmizet a pokračovat jen v Expedici / Archivu.
4. Položka vrácená do TPV má dál v TPV ukazovat stav „Vráceno z výroby“, ale nesmí se počítat jako aktivní Inbox položka k naplánování.

### Problém
Poslední změna byla příliš tvrdá: `useProductionInbox` teď načítá pouze `status = pending`. Tím sice zmizela položka `T.03` z aktivního Inboxu, ale rozbilo se počítání projektového progresu.

Konkrétně projekt jako Insia:
- má jednu položku vrácenou do TPV,
- tedy ještě není kompletně přijatý do výroby,
- proto má zůstat nahoře v Inboxu jako projekt s chybějící položkou,
- ale samotná vrácená položka se nemá zobrazit jako plánovatelná Inbox položka.

### Implementace

#### 1. Oddělit aktivní Inbox od progres výpočtu
V `src/hooks/useProductionProgress.ts` upravím význam stavů:

- `pending` = položka čeká v Inboxu na naplánování
- `returned` = položka je zpět v TPV a má se počítat jako „chybí ve výrobě“, ne jako „v Inboxu“
- `scheduled`, `in_progress`, `paused`, `completed` = položka je už ve výrobním toku

Tedy:
```text
pending  -> in_inbox
returned -> missing / TPV
scheduled/in_progress -> scheduled
paused -> paused
completed -> completed
```

Tím se Insia s jednou vrácenou položkou znovu objeví nahoře jako projekt, kterému ještě chybí TPV položka.

#### 2. Nevracet `returned` do aktivního seznamu k plánování
V `src/hooks/useProductionInbox.ts` nechám aktivní query pro Inbox položky jen na:

```ts
.eq("status", "pending")
```

To je správně pro horní aktivní seznam položek, které lze plánovat. Vrácené položky nepatří mezi plánovatelné Inbox položky.

#### 3. Opravit výpočet „missing“
V `useProductionProgress.ts` změním výpočet tak, aby se `returned` položky nepočítaly jako přijaté do výroby.

Nová logika:
```text
accountedFor = pending + scheduled + completed + paused
missing = total_tpv - accountedFor
```

Ale `returned` nebude v `pending`, takže vrácená položka zůstane jako chybějící TPV položka.

#### 4. Opravit spodní část Inboxu „Naplánováno“
V `src/components/production/InboxPanel.tsx` upravím rozdělení projektů:

- horní část:
  - aktivní `pending` položky,
  - plus projekty s `missing > 0`, které nejsou dokončené,
- spodní část „Naplánováno“:
  - jen projekty s `missing === 0`,
  - `in_inbox === 0`,
  - mají ještě aktivní výrobní položky (`scheduled`, `in_progress`, `paused`),
  - nejsou celé dokončené,
- úplně mimo Inbox:
  - projekty, kde `missing === 0`,
  - `in_inbox === 0`,
  - `scheduled === 0`,
  - `paused === 0`,
  - a vše je `completed` / v Expedici.

Tím se hotové projekty nebudou zobrazovat v Inboxu, ale budou pokračovat přes Expedici.

#### 5. Zachovat TPV badge „Vráceno z výroby“
`src/hooks/useProductionStatuses.ts` ponechám tak, aby `returned` z `production_inbox` dál vytvářelo oranžový badge „Vráceno z výroby“ v TPV seznamu.

To znamená:
- položka nebude v aktivním Inboxu,
- ale v TPV bude pořád vidět, že byla vrácená z výroby.

#### 6. Opravit realtime cache pro Inbox
V `src/hooks/useRealtimeSync.ts` zkontroluji a upravím cache aktualizace pro `production_inbox`, protože aktuální realtime INSERT logika pravděpodobně zapisuje raw řádky do cache, i když hook očekává seskupené `InboxProject[]`.

Bezpečnější řešení:
- při změně `production_inbox` invalidovat:
  - `production-inbox`
  - `production-progress`
- místo přímého `setQueryData` na jiný tvar dat.

Tím se po vrácení položky do TPV správně přepočítá horní/spodní sekce.

### Očekávané chování po opravě

#### Insia s jednou položkou `T.03` vrácenou do TPV
- `T.03` nebude jako plánovatelná položka v aktivním Inboxu.
- Projekt Insia zůstane nahoře v Inboxu jako „chybí 1 položka“.
- V TPV bude `T.03` dál označená jako „Vráceno z výroby“.

#### Projekt, který má vše naplánované, ale není hotový
- Nebude nahoře mezi chybějícími.
- Bude dole v sekci „Naplánováno“.

#### Projekt, který má vše vyrobeno
- Z Inboxu zmizí úplně.
- Bude vidět jen v Expedici, případně následně v archivu.

### Ověření
Po implementaci ověřím:

1. Insia:
   - jedna položka vrácená do TPV,
   - projekt zůstává nahoře jako chybějící položka.
2. Aktivní Inbox:
   - neobsahuje vrácené položky jako položky k plánování.
3. Sekce „Naplánováno“:
   - obsahuje jen projekty kompletně přijaté do výroby, ale ještě nedokončené.
4. Expedice:
   - dokončené projekty nejsou v Inboxu a pokračují pouze v Expedici/Archivu.
5. Build projde bez TypeScript chyb.
