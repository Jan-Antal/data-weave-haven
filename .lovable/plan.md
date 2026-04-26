## Problém

`DilnaDashboard` používa **legacy aggregator** `pctByProjectWeek` postavený nad kľúčom `${pid}::${weekKey}`. To znamená:

1. Pre projekt s **dvomi bundlami v rovnakom týždni** (Allianz A-5 + B, Insia A-4 + B) sa všetky daylog záznamy mapujú na ten istý kľúč, posledný zápis prepíše ostatné, a per-bundle identita sa stratí.
2. Funkcia `resolveBundlePct` má guard "brand-new full bundle → null", ktorý spôsobí, že **úplne nový bundle v týždni dostane `null`** namiesto svojho skutočného daylogu — preto sa zobrazí pomlčka `—/60%` a `—/100%`.
3. V DB pritom **bundle-scoped záznamy reálne existujú** vo formátoch `pid::week::SG:<group>` a `pid::week::<stage>::<label>::<part>` — sú zapisované z `Vyroba.tsx`, ale `DilnaDashboard` ich vôbec nečíta.

## Riešenie

Refaktorovať `DilnaDashboard` aby čítal **bundle-scoped daylogy priamo** rovnakou logikou ako `Vyroba.tsx` (`bundleStorageIdForProject`).

### Zmeny v `src/components/DilnaDashboard.tsx`

1. **Nový aggregator `pctByBundleId`**: namiesto `pctByProjectWeek` (kľúč `pid::week`) postaviť `Map<bundleStorageId, number>` — najnovší `percent` per *bundle-scoped* `bundle_id` (max `day_index`, najnovší `logged_at` ako tie-breaker).

2. **Helper `bundleStorageId(pid, weekKey, splitGroupId, stageId, bundleLabel, splitPart)`** — replikovať logiku z `Vyroba.tsx`:
   - Ak `split_group_id` existuje → `${pid}::${weekKey}::SG:${splitGroupId}`
   - Inak → `${pid}::${weekKey}::${stageId ?? "none"}::${bundleLabel ?? "A"}::${splitPart ?? "full"}`

3. **Prepísať `resolveBundlePct`**: 
   - Najprv vyskúšať priamy lookup `pctByBundleId.get(bundleStorageId(...))` pre zobrazený týždeň.
   - Ak chýba, walk-back cez predošlé týždne pre **rovnaký** `split_group_id` (pre split bundles) alebo rovnakú `stage::label` identitu (pre full bundles), pričom kľúč konštruujeme s `weekKey` daného predošlého týždňa.
   - Legacy fallback (čítanie `pid::weekKey` bez bundle suffixu) ponechať len ak projekt má v danom týždni **práve jeden bundle** — pre staré dáta pred migráciou.
   - **Odstrániť guard "brand-new full bundle → null"** — ten bol iba workaround chýbajúcej bundle identity; po prechode na bundle-scoped IDs je nepotrebný a škodlivý.

4. **Sekundárne použitie `latestPctByProject`** (riadky 627, 721): tento map sa stále používa pre fallback `completionPct` na úrovni projektu. Po refaktore by mal byť odvodený z `pctByBundleId` cez agregáciu (napr. max naprieč bundle storage IDs daného projektu) namiesto z legacy `pid::week` kľúča.

5. **Spilled bundles** (riadok 578) a **prevLatestPctByProject** (riadok 337) — analogická úprava: spilover guard porovnávať per-bundle, nie per-projekt, použitím rovnakého `bundleStorageId` voči `prevWeekInfo.weekKey`.

### Žiadne DB zmeny

Migrácia zo session 1 už zabezpečila bundle-scoped záznamy v DB; teraz ich len začneme správne čítať aj v Dílňa pohľade.

### Outcome

- Allianz Z-2617-001 v T17: A-5 ukáže svoje skutočné `60%`, B ukáže svojich `100%`.
- Insia Z-2605-001 v T17: A-4 a B každý nezávisle podľa svojho daylog kľúča.
- Žiadny bundle nedostane pomlčku, ak preňho existuje záznam v `production_daily_logs`.
- Konzistencia s `Vyroba.tsx` a `useProductionDailyLogs` — všetky 3 modely čítajú rovnaké bundle-scoped IDs.
