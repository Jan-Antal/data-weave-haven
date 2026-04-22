
## Plán úpravy hlavičky Inboxu

### Cíl
Zjednoduším hlavičku Inboxu v Plánu výroby tak, aby neukazovala duplicitní nebo matoucí informace.

Aktuálně je problém hlavně v tom, že:

```text
rizikové
```

je v podstatě taky položka/projekt k řešení, ale riziko už je vidět přímo na badge projektu. V hlavičce to proto vytváří zbytečný šum.

---

## Úprava, kterou provedu

### 1. Odstraním „rizikové“ z hlavičky Inboxu

Z hlavičky odstraním tento údaj:

```text
1 rizikové
```

Nebude se už počítat ani zobrazovat v horním řádku Inboxu.

Rizikovost zůstane vidět tam, kde dává smysl:
- na konkrétní projektové kartě,
- přes deadline / urgency badge projektu.

---

### 2. Odstraním globální badge „NOVÉ N“ z hlavní hlavičky

Globální:

```text
NOVÉ 3
```

v horní hlavičce odstráním, aby se informace neduplikovala.

Badge `NOVÉ N` nechám na konkrétních projektových kartách, protože tam uživatel hned vidí, kde se nová položka objevila.

---

### 3. Změním text „prvků“ na jasnější „k naplánování“

Místo:

```text
11 projektů, 1 prvků
```

bude hlavička ukazovat například:

```text
Inbox
11 projektů · 1 k naplánování
```

Tím bude jasné, že druhé číslo znamená aktivní položky čekající na plánování, ne všechny TPV položky projektu.

---

### 4. Zachovám sekci „Naplánováno“ samostatně

Dolní sekce zůstane oddělená:

```text
✓ Naplánováno (5)
```

Nebude se míchat do hlavní hlavičky Inboxu.

---

## Výsledný vzhled

Navrhovaná hlavička:

```text
📥 Inbox                         >
11 projektů · 1 k naplánování
```

Bez:
- globálního `NOVÉ N`,
- `rizikové`,
- nejasného slova `prvků`.

---

## Technická změna

Upravím pouze:

```text
src/components/production/InboxPanel.tsx
```

Konkrétně:
1. odstraním `urgentItemCount` z renderu hlavičky,
2. odstraním globální `totalNewItemCount` badge z hlavičky,
3. přejmenuji `totalItemCount` v UI na text `k naplánování`,
4. nechám projektové `NOVÉ N` badge beze změny,
5. ověřím build.
