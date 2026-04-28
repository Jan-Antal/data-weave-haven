## Problém

V Analytics → Dílna sa projekt **Příluky Valovi Dům (Z-2504-019)** zobrazuje **dvakrát**:
1. Hore ako **"Přelité z T17"** (spilled-only karta) — 11h / plán 0h
2. Dole ako **"Mimo Plán výroby"** (off-plan karta) — 11h / plán 0h

Mali by byť zlúčené pod jednu kartu (tú prelitú).

## Príčina

V `src/components/DilnaDashboard.tsx` má agregátor 4 cykly, ktoré napĺňajú `cards[]`:
1. **Loop 1** (línia 675) — projekty so schedule v aktuálnom týždni
2. **Loop 1.5** (línia 772) — *spilled-only* projekty (neukončené T-1 bundles, žiadny schedule v T)
3. **Loop 2** (línia 839) — *unmatched* (logované hodiny na neznáme `project_id`)
4. **Loop 3** (línia 865) — *off-plan* (logované hodiny na známy projekt bez schedule v T)

Loop 1.5 pridá kartu pre `Z-2504-019` ako spilled (lebo má neukončený bundle z T17 a žiadny schedule v T18), pričom ju **správne zobrazí s `loggedHours` 11h**.

Loop 3 ale kontroluje len `scheduledProjects.has(pid)` — nie aj `spilledOnlyProjects.has(pid)`. Preto ten istý projekt sa pridá ešte raz ako "Mimo Plán výroby", lebo:
- v `production_schedule` pre T18 nemá žiadny riadok (`scheduledProjects` ho neobsahuje)
- v `projects` tabuľke existuje (`knownProjectIds` ho obsahuje)
- má logované hodiny v T18 (`hoursByProject` má 11h)

To isté riziko platí aj pre loop 2 (unmatched), aj keď tam je menej pravdepodobné.

## Oprava

Do **loop 2** (línia 840) a **loop 3** (línia 866) pridať dodatočný `continue`, ktorý preskočí projekty už pridané v loop 1.5:

```ts
// Loop 2 — unmatched
for (const [pid, loggedHours] of hoursByProject) {
  if (scheduledProjects.has(pid)) continue;
  if (spilledOnlyProjects.has(pid)) continue; // ← NOVÉ
  if (knownProjectIds.has(pid)) continue;
  ...
}

// Loop 3 — off-plan
for (const [pid, loggedHours] of hoursByProject) {
  if (scheduledProjects.has(pid)) continue;
  if (spilledOnlyProjects.has(pid)) continue; // ← NOVÉ
  if (!knownProjectIds.has(pid)) continue;
  ...
}
```

Spilled-only karta už zobrazuje `loggedHours` (línia 825), takže žiadna informácia sa nestratí — len odstránime duplicitu.

## Výsledok

- Príluky Valovi Dům sa v Dílna prehľade zobrazí **iba raz** — ako "Přelité z T17" karta s 11h logovanými.
- Žiadne `Mimo Plán výroby` ghost karta.
- Counts v hornej summary lište (`Mimo Plán / Nespárované`) sa znížia o správny počet (3 → 2 v tomto prípade).

## Súbory na úpravu

- `src/components/DilnaDashboard.tsx` — 2 jednoriadkové vsuvky (loop 2 a loop 3)
