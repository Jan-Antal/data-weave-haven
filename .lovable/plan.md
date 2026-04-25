# Plán: Oprava prázdneho modulu Project Info pre rolu Vedoucí výroby (a všeobecne pre Read/Write/Off)

## Čo som zistil (vizuálna verifikácia + analýza kódu)

Otestoval som v preview rolu **Vedoucí výroby** (cez „Zobrazit jako"). Po prepnutí sa stránka `/` (Project Info) ukáže s hlavičkou, dashboardom a tabmi **Project Info / PM Status / TPV Status / Harmonogram**, ale **obsahová časť pod tabmi je úplne prázdna** — žiadna tabuľka. Všetky 3 taby vyzerajú ako neaktívne (sivé), nikto nie je „selected".

### Skutočná príčina (root cause) — bug v `useAuth.tsx` `defaultTab`

V `src/hooks/useAuth.tsx` (riadky 299–309) sa `defaultTab` počíta takto:

```ts
let defaultTab = "project-info";
if (permissions.canQCOnly && !permissions.canCreateProject) {
  defaultTab = "vyroba";
} else if (permissions.canAccessPlanVyroby && !permissions.canCreateProject) {
  defaultTab = "vyroba";   // ← TU
} else if (permissions.canManageTPV && !permissions.canCreateProject) {
  defaultTab = "tpv-status";
} else if (permissions.canCreateProject) {
  defaultTab = "pm-status";
}
```

Vedoucí výroby má v DB defaultoch (overené `role_permission_defaults`):
- `canAccessPlanVyroby: true`
- `canCreateProject: false`

→ `defaultTab = "vyroba"`.

`src/pages/Index.tsx` (r. 197–199) tento `defaultTab` natvrdo nasadí:
```ts
useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);
```

Lenže `Index.tsx` má len `TabsContent` pre **`project-info`, `pm-status`, `tpv-status`, `plan`**. Pre `value="vyroba"` neexistuje žiadny `TabsContent` → `Tabs` nezobrazí nič → **prázdny modul**.

Hodnota `"vyroba"` zjavne pôvodne mala znamenať „presmeruj na route `/vyroba`", nie „aktívny tab v Index". Tabu `vyroba` v `/` nebola nikdy.

### Vedľajšie chyby ktoré odhalí ten istý prípad

1. **Visibility tabov v Index.tsx neexistuje.** Aj keď `useAuth` vystavuje `canViewProjectInfoTab / canViewPMStatusTab / canViewTPVStatusTab / canViewHarmonogram`, `Index.tsx` ich vôbec nepoužíva. Taby sa renderujú vždy bez ohľadu na permissions. Takže ak napr. PM má vypnutý PM Status sub-flag, tab sa aj tak ukáže a klikateľný je.
2. **Read-only mód nefunguje.** Tabuľky (`ProjectInfoTable`, `PMStatusTable`, `TPVStatusTable`) berú `canEdit` z `useAuth`, ale ten sa nepárouje s novými flagmi `canWriteProjectInfoTab` / `canWritePMStatusTab` / `canWriteTPVStatusTab`. Vedoucí výroby má `canEdit: true` → čítanie aj zapisovanie sú rovnaké, hoci nastavenie hovorí „len Čítať" pre PM Status / TPV Status.
3. **Harmonogram (`activeTab="plan"`) sa rovnako neguje** podľa `canViewHarmonogram`.

## Návrh opravy

### A) `src/hooks/useAuth.tsx` — `defaultTab`
Vrátiť hodnotu, ktorú reálne pozná `Index.tsx` (jeden z `project-info` / `pm-status` / `tpv-status` / `plan`). Pre roly bez prístupu k Project Info modulu sa o presmerovanie už stará `IndexRoute` v `App.tsx` (na `/plan-vyroby`, `/vyroba`, …), takže `defaultTab` stačí, aby vrátil prvý **viditeľný** tab v Project Info module. Nová priorita:

```
1. canViewProjectInfoTab → "project-info"
2. canViewPMStatusTab    → "pm-status"
3. canViewTPVStatusTab   → "tpv-status"
4. canViewHarmonogram    → "plan"
5. fallback              → "project-info"
```

Tým padne hodnota `"vyroba"` (nikdy nebola validná v `/`). Routovacia časť (do `/vyroba`, `/plan-vyroby`) ostáva v `IndexRoute` nedotknutá.

### B) `src/pages/Index.tsx` — gating tabov + safe activeTab
1. Z `useAuth` načítať `canViewProjectInfoTab, canViewPMStatusTab, canViewTPVStatusTab, canViewHarmonogram`.
2. Vyrátať `visibleTabs: string[]`.
3. Po načítaní `defaultTab` ho cez `useEffect` zvalidovať: ak `defaultTab` nie je vo `visibleTabs`, použiť `visibleTabs[0]` (alebo `"project-info"` ako bezpečný default — IndexRoute už zaručil, že máme `canAccessProjectInfo`).
4. Renderovať jednotlivé `TabsTrigger` len ak je daný flag true. Pri `Harmonogram` tlačidle (vpravo) tiež skryť, ak `!canViewHarmonogram`.
5. Tlačidlo „Nový projekt" už správne podlieha `canCreateProject` — netreba meniť.

### C) Read-only podľa `canWrite*`
Tabuľky berú jeden globálny `canEdit`. Pre per-tab read/write potrebujeme jemnejší prísup:
- **`ProjectInfoTable`**: `canEdit = useAuth().canWriteProjectInfoTab` (namiesto generického `canEdit`).
- **`PMStatusTable`**: `canEdit = useAuth().canWritePMStatusTab`.
- **`TPVStatusTable`**: `canEdit = useAuth().canWriteTPVStatusTab`.
- **`PlanView` (Harmonogram)**: ak je len read, vypnúť drag-drop / inline editácie pomocou `canWriteHarmonogram` (preposlať ako prop a respektovať v stage edit dialógoch).
- Globálny `canEdit` v `useAuth` ostáva pre back-compat (používa ho viac miest), iba tabuľky prejdú na granulárny flag.

Existujúca cascade logika v `permissionPresets.ts` zaručuje, že `canWrite* = true ⇒ canView* = true`, takže nie je potrebná žiadna ďalšia stráž.

### D) Mobilná stránka
`MobileCardList`, `MobileTPVCardList` a `MobileDetailProjektSheet` momentálne nerešpektujú per-tab read/write — sú prevažne read-only (s výnimkami). Pre tento ticket ponechať ako je; mobile sa rieši samostatne neskôr (nech sa doplní samostatne, aby sme nerozbehli viacero zmien naraz).

## Akceptačné kritériá

1. **Vedoucí výroby (simulácia z Owner-a)** otvorí `/` → vidí Project Info tabuľku s projektmi (žiadny prázdny obsah). Aktívny tab je farebne zvýraznený.
2. Pre Vedoucí výroby tabuľky **Project Info / PM Status / TPV Status sú read-only** (žiadna inline editácia, žiadne tlačidlo „Pridať etapu", žiadne tlačidlo „Nový projekt").
3. Ak v Oprávnění vypnem `canViewPMStatusTab` pre PM rolu → PM už **nevidí tab „PM Status"** v hlavičke `/`.
4. Ak v Oprávnění zapnem **Read** pre Project Info → tab je viditeľný, ale všetky polia sú read-only (badge a inline edity sa neotvárajú).
5. Ak vypnem `canViewHarmonogram` → tlačidlo „📅 Harmonogram" vpravo zmizne; prepnúť na `plan` cez URL nepôjde (resp. spadne na default tab).
6. Existujúce roly (Owner, Admin, PM, Vedoucí PM, Konstruktér) vidia presne to isté čo doteraz — žiadna regresia.
7. Po refreshi `/` vždy spadne na prvý povolený tab (žiadny stav „prázdne pod tabmi").

## Súbory, ktorých sa zmena dotkne

- `src/hooks/useAuth.tsx` — oprava `defaultTab`.
- `src/pages/Index.tsx` — gating tabov, validácia `activeTab`, skrytie Harmonogramu.
- `src/components/ProjectInfoTable.tsx` — `canEdit` z `canWriteProjectInfoTab`.
- `src/components/PMStatusTable.tsx` — `canEdit` z `canWritePMStatusTab`.
- `src/components/TPVStatusTable.tsx` — `canEdit` z `canWriteTPVStatusTab`.
- `src/components/PlanView.tsx` (a stage edit dialógy v ňom) — rešpektovať `canWriteHarmonogram`.

## Mimo rozsahu

- Mobilné karty / sheets (samostatný follow-up).
- TPV List read/write (`canWriteTPVListTab`) — rieši samostatný ticket pre TPV modul.
- Migrácia DB — netreba; všetko v JSONB, defaults už sedia.
