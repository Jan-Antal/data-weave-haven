
## Viditeľný modrý badge „NOVÉ“ v Inboxe

### Cíl
V Inboxe Plánu výroby bude jasně vidět, že do projektu / bundlu přibyly nové prvky, i když jsou schované uvnitř sbaleného bundlu a uživatel je nechce hned plánovat.

Badge bude **modrý**, ne oranžový.

---

## Pravidlo, jak dlouho se badge drží

Badge **NOVÉ** zůstane viditelný, dokud nenastane jedna z těchto akcí:

```text
1. Uživatel klikne na „Označit jako přečtené“
nebo
2. Položka se naplánuje a tím zmizí z Inboxu
```

To znamená:

- pokud novou položku jen uvidíš, ale nechceš ji hned plánovat, badge tam zůstane,
- nezmizí automaticky po otevření Inboxu,
- nezmizí automaticky po rozbalení bundlu,
- nezmizí po refreshi stránky,
- nezmizí ani na jiném zařízení stejného uživatele,
- zmizí až vědomou akcí „Označit jako přečtené“ nebo tím, že položka už v Inboxu není.

Každý uživatel bude mít vlastní stav přečtení.

---

## Implementace

### 1. Ukládání posledního přečtení
Do uživatelských preferencí přidám timestamp:

```text
production_inbox_seen_at
```

Ten určuje, od kdy se položky v Inboxu už nepovažují za nové.

Nová položka je:

```text
production_inbox.sent_at > user_preferences.production_inbox_seen_at
```

Pokud preference ještě neexistuje, nastaví se bezpečný výchozí stav tak, aby staré historické položky nezačaly všechny svítit jako nové navždy.

### 2. Modrý badge v hlavičce Inboxu
V hlavičce Inboxu bude badge například:

```text
NOVÉ 7
```

Styl:
- modré pozadí / modrý border,
- výrazný, ale ne alarmující vzhled,
- nebude používat oranžovou, aby se nepletl s urgentními nebo varovnými stavy.

Vedle badge bude akce:

```text
Označit jako přečtené
```

Po kliknutí se `production_inbox_seen_at` nastaví na aktuální čas a všechny aktuálně nové pending položky přestanou být označené jako nové.

### 3. Modrý badge na projektovém bundlu
Každý projektový bundle s novými položkami dostane badge:

```text
NOVÉ 3
```

Bude viditelný i když je bundle sbalený.

Projektová karta dostane jemné modré zvýraznění, aby bylo jasné, že uvnitř je něco nového.

### 4. Modrý badge na konkrétní položce
Uvnitř rozbaleného bundlu dostane každá nová položka malý badge:

```text
NOVÉ
```

Příklad:

```text
TK.04  ×2  Nízká skříň  NOVÉ  24h
```

### 5. Řazení projektů s novými položkami výš
Projekty s novými položkami se posunou výš v Inboxu, aby nezapadly.

Zachovám ale logiku urgence:

```text
1. urgentní / po termínu + nové
2. ostatní nové
3. zbytek podle současné urgency logiky
```

### 6. Zachování workflow
Nemění se:
- plánování,
- drag & drop,
- split položky,
- forecast,
- stav položek v `production_inbox`.

Badge je pouze viditelná vrstva nad existujícími pending položkami.

---

## Soubory / změny

### Databáze
- nová migrace:
  - rozšíření `user_preferences` o `production_inbox_seen_at`

### Frontend
- `src/hooks/useUserPreferences.ts`
  - rozšířit typ preferencí,
  - umožnit uložit `production_inbox_seen_at`

- `src/components/production/InboxPanel.tsx`
  - výpočet nových položek,
  - modrý badge v hlavičce,
  - tlačítko „Označit jako přečtené“,
  - badge na projektovém bundlu,
  - badge na konkrétní položce,
  - zvýhodnění nových položek v řazení

### Paměť projektu
- `mem://features/production-planning/inbox-panel-config`
  - doplnit pravidlo, že nové inbox položky se značí modrým `NOVÉ` badge a zůstávají viditelné do ručního označení jako přečtené nebo naplánování.

---

## Výsledek

- Nové prvky v Inboxu se už neztratí uvnitř bundlů.
- Badge bude modrý a jednoznačně odlišený od urgentních / varovných stavů.
- Badge nezmizí jen proto, že uživatel Inbox otevřel.
- Uživatel může nové položky nechat označené, dokud je nechce řešit.
- Zmizí až po „Označit jako přečtené“ nebo po naplánování položky.
