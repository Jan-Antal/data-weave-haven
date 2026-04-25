# Plán: Opraviť „Zobrazení jako Vedoucí PM nezodpovedá nastaveniu Oprávnění"

## Čo som zistil (vizuálne overené v preview)

1. **V Oprávnění → Vedoucí PM** vidí Admin: Project Info modul **zapnutý**, všetky sub-záložky (Project Info / PM Status / TPV Status / TPV List / Harmonogram) na **„Upraviť"**, všetky features (a–h) na **„Áno"**.
2. **V „Zobrazit jako: vedouci_pm"** ale Vedoucí PM v reále:
   - V hlavičke chýba ikona **Výroba** (Daylog) – aj keď preset má `canAccessDaylog: true`.
   - V „Project Info" tabe **chýba TPV List ako záložka** (TPV List sa otvára až cez Project Info detail – existuje ale nemá vlastný visible flag v `Index.tsx`).
   - Nie je istota, že write/read flagy v UI majú reálny dopad na tabuľky (PM Status / TPV Status / Harmonogram).

## Skutočné root causes

### A) Nesúlad medzi `ROLE_PRESETS` a `MODULE_CASCADE` (najväčší bug)

V `src/lib/permissionPresets.ts`:

```ts
// Cascade group:
{ master: "canManageProduction",
  subs: ["canAccessDaylog", "canAccessQC", "canQCOnly", "canWriteDaylog", "canWriteQC"] }

// Vedoucí PM preset:
vedouci_pm: preset(
  ...projectInfoFull,
  "canCreateProject", ...
  "canAccessPlanVyroby", "canWritePlanVyroby", "canAccessForecast",
  "canAccessDaylog",            // ← sub-flag bez mastera
  "canManageOverheadProjects",
)
// chýba: canManageProduction
```

Pri `applyCascade()` sa `canAccessDaylog` **premaže na `false`**, lebo master `canManageProduction` je `false`. Výsledok: Vedoucí PM nemá Daylog, hoci v presete ho má — a v UI Oprávnění Admin vidí toggle „zapnutý". Ten je z `ROLE_PRESETS` pred kaskádou; po vypočítaní permissions cez `resolvePermissions()` sa ale flag stratí.

Rovnaký problém má **Vedoucí výroby** preset (riadky 446–453): tiež má `canAccessDaylog` ale preset má aj `canManageProduction`, takže to prežije. Treba prejsť **všetky presety** a zaručiť, že každý sub-flag ide ruka v ruke s príslušným masterom.

Konkrétne nálezy v `ROLE_PRESETS`:
- `vedouci_pm`: chýba `canManageProduction` (má sub `canAccessDaylog`).
- `pm`: chýba `canManageProduction` (má sub `canAccessDaylog`).
- `admin`: má `ALL_TRUE` ale potom vypína `canQCOnly`, `canAccessTpv` atď. — `canAccessTpv=false` zhasne všetky TPV sub-flagy. Treba overiť, že je to zámer (asi áno – admin nemá vidieť TPV modul počas vývoja).

**Oprava:** doplniť `canManageProduction` do `vedouci_pm` a `pm` presetov, aby Daylog ostal po kaskáde aktívny.

### B) UI Oprávnění (`OsobyOpravneni.tsx`) zobrazuje toggle „pred-kaskádou"

UI číta surové presety (resp. uložené overrides) a zobrazuje toggle bez aplikácie kaskády. Admin vidí, že „canAccessDaylog = ON" pre Vedoucí PM, ale runtime flag je `false`. Treba:

1. Pri renderovaní sub-toggle ho **vizuálne disable-nuť** (sivý + tooltip „Modul je vypnutý") keď master flag je OFF.
2. Pri ukladaní force-nuť `false` do payloadu pre všetky sub-flagy, ktorých master je OFF (single source of truth = `applyCascade`).
3. (Voliteľne) Pri **zapnutí mastera** ponúknuť „obnoviť default sub-flagy z presetu" – ale táto logika môže prísť v ďalšom ticketu.

### C) TPV List nie je samostatná záložka v `/`

V Oprávnění je riadok **„TPV List"** s read/write toggle, ale `Index.tsx` **nerenderuje TabsTrigger pre TPV List** – modul sa otvára len cez stĺpec v Project Info tabuľke (`onOpenTPVList`). Toggle teda nemá UI ekvivalent.

Možnosti:
- (Odporúčam) **Zmazať „TPV List" z Oprávnění** ako samostatný pod-tab a nechať len `canViewTPVListTab` / `canWriteTPVListTab` ako interný flag, ktorý gate-uje otvorenie TPV List view (aj cez stĺpcové tlačidlo). Užívateľ nesmie otvoriť TPV List ak `canViewTPVListTab=false` aj keď klikne na ikonu v stĺpci.
- Alternatíva: pridať TPV List ako 4. tab v `Index.tsx` (väčšia zmena UX, ide proti súčasnému contextu).

### D) Forecast tlačidlo v Plán Výroby nie je gate-nuté

`src/pages/PlanVyroby.tsx` zobrazuje Forecast prepínač vždy, hoci máme flag `canAccessForecast`. Treba podmieniť render Forecast tlačidla v `ToolbarRow2` cez `canAccessForecast`.

### E) Verifikácia, že write-flagy reálne fungujú v Harmonogram-e

V minulom kole sa write flag pre Harmonogram (`canWriteHarmonogram`) spomenul ale nie je integrovaný v `PlanView.tsx` (ani v `StageDateEditDialog`, `PlanDateEditDialog`). Vedoucí výroby (read-only Project Info) môže stále drag-nuť stage dátumy. Treba doplniť.

## Akceptačné kritériá

1. **Vedoucí PM** v simulácii uvidí:
   - V hlavičke ikonu **Výroba** (Daylog) ✅
   - V hlavičke ikony Plán Výroby, Analytics, Project Info ✅
   - Tlačidlo **„Nový projekt"** ✅
   - Settings gear → „Správa osob", „Režijní projekty", „Koš" (ostatné podľa preset-u skryté).
2. **PM** rovnako uvidí Vyroba modul (Daylog), keďže v presete je `canAccessDaylog` a teraz aj `canManageProduction`.
3. V UI Oprávnění:
   - Keď admin vypne **master „Modul výroba"** (canManageProduction) → sub toggle „Daylog R/W/Off", „QC R/W/Off" sa zobrazí **sivo s tooltipom „Modul je vypnutý"** a save ich force-uje na `false`.
   - To isté platí pre všetky moduly s mastrom.
4. **Forecast** tlačidlo v Plán Výroby je viditeľné iba ak `canAccessForecast=true`.
5. **TPV List** sa neotvorí (cez stĺpcovú ikonu v Project Info tabuľke) ak `canViewTPVListTab=false`.
6. **Harmonogram** drag-nutie stage milestone funguje len ak `canWriteHarmonogram=true`. Inak je drag vypnutý a edit dialógy sú read-only.
7. Žiadna regresia pre Owner / Admin / Konstruktér / Vedoucí výroby.

## Súbory, ktorých sa zmena dotkne

- `src/lib/permissionPresets.ts`
  - Pridať `canManageProduction` do `vedouci_pm` a `pm` presetov.
  - Voliteľne: prejsť všetky presety auditom skript-grepom proti `MODULE_CASCADE` (manuálna verifikácia v PR popise).
- `src/components/osoby/OsobyOpravneni.tsx`
  - Pri rendere sub-toggle čítať `draftPerms[masterFlag]`; ak `false`, pridať `disabled` + tooltip „Najprv zapnite modul {label}".
  - Pri save vstupe spustiť `applyCascade(draft)` aby sa do DB uložil len konzistentný stav (žiadne sub=true ak master=false).
- `src/pages/PlanVyroby.tsx` (`ToolbarRow2`)
  - Forecast prepínač: `{canAccessForecast && (...)}`.
  - Importovať `canAccessForecast` z `useAuth()`.
- `src/components/ProjectInfoTable.tsx`
  - Stĺpcovú ikonu „TPV List" gate-nuť: `canViewTPVListTab` (skryť alebo disable s tooltipom).
- `src/components/PlanView.tsx` + `src/components/StageDateEditDialog.tsx` + `src/components/PlanDateEditDialog.tsx`
  - Z `useAuth()` čítať `canWriteHarmonogram`, drag handler-y a save tlačidlá podmieniť.

## Mimo rozsahu (následné tickety)

- Auditovacia stránka pre admina, ktorá zobrazí „efektívne" permissions po kaskáde (debug nástroj).
- Mobile karty / TPV List view úprava read/write — samostatný ticket.
- Migrácia `user_roles.permissions` — netreba; po doplnení master flagov sa cascade správne prepočíta sám pri prvom načítaní.
