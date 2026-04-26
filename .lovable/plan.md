# Plán: Dokončenie permission systému + simulačný info bar + vizuálne overenie

## 1) Harmonogram – Read/Write enforcement v edit dialógoch

Drag-and-drop v `PlanView.tsx` už `canWriteHarmonogram` rešpektuje. Edit dialógy ale stále umožňujú uloženie zmien dátumov etáp a projektových milestonov používateľovi s read-only Harmonogramom.

**`src/components/PlanDateEditDialog.tsx`**
- Z `useAuth()` čítať aj `canWriteHarmonogram`.
- Tlačidlo „Uložit" skryť ak `!canWriteHarmonogram` (rovnaké správanie ako pre `isViewer` – label „Zavřít", pickery `disabled`).
- V mape `DATE_FIELDS` poppovery deaktivovať keď `!canWriteHarmonogram`.

**`src/components/StageDateEditDialog.tsx`**
- To isté: z `useAuth()` `canWriteHarmonogram`, gate uloženia + pickerov.

## 2) Info bar pre simuláciu role („Zobrazit jako…")

Owner môže cez header → Settings → „Zobrazit jako" prepnúť `simulatedRole`. Aktuálne ale chýba akákoľvek vizuálna pripomienka, že beží v simulácii – ľahko sa zabudne, prečo niečo „nejde". Pridáme top sticky bar.

**Nový súbor `src/components/SimulatedRoleBar.tsx`**
- Read-only komponent: ak `simulatedRole && realRole === "owner"`, zobrazí oranžový pruh nad obsahom:
  - Text: `👁 Zobrazujete aplikáciu ako: <ROLE_LABEL>`
  - Tlačidlo „Ukončit simulaci" → `setSimulatedRole(null)`
- Vizuál: `bg-amber-500/15`, border-bottom `border-amber-500`, text `amber-700/300`, height ~32px, `position: sticky; top: 0; z-index: 250` (pod hlavičkou 300, nad zvyškom).

**`src/App.tsx`**
- Importovať `SimulatedRoleBar` a vyrenderovať tesne pod `PersistentDesktopHeader` (ale stále mimo `<Routes>` aby pretrvával naprieč navigáciou).

**`src/hooks/useAuth.tsx`**
- Pridať do návratovej hodnoty `realRole: AppRole | null` ak ešte nie je exposed (na rozhodnutie v bare).

## 3) Settings dropdown – filter položiek podľa permissions

V `ProductionHeader.tsx` (Settings ⚙) dnes každý vidí celý zoznam (Správa osob, Kurzový lístok, Statusy, Koš, Režijní projekty, Presety, Formula builder). Skryjeme položky, na ktoré chýbajú permissions:
- „Kurzový lístek", „Výpočetní logika (Formula Builder)", „Cost-breakdown presety" → `canAccessSystem`.
- „Správa osob" → `canAccessPeople` (alebo `canAccessOpravneni`).
- „Statusy" → `canManageStatuses` (existujúci) alebo prelinkovať na `canAccessSystem`.
- „Koš" → `canAccessRecycleBin`.
- „Režijní projekty" → `canManageOverheadProjects`.
- „Zobrazit jako" → ponechať len pre `realRole === "owner"`.

## 4) Vizuálne overenie (browser tools)

Po aplikovaní zmien vykonať **screenshot-driven QA** cez `browser--*`:
1. Login ako owner → otvoriť `/`, nastaviť `setSimulatedRole("vedouci_pm")` → očakávať:
   - Žltý info bar hore „Zobrazujete aplikáciu ako: Vedoucí PM" + „Ukončit simulaci".
   - V hlavičke ikony: Project Info, Plán Výroby, Analytics, **Výroba (Daylog)**, **TPV**.
   - V `/` taby: Project Info / PM Status / TPV Status / Harmonogram – všetky editovateľné.
   - V Plán Výroby je viditeľný **Forecast** prepínač.
2. Prepnúť na `vedouci_vyroby` → očakávať:
   - V hlavičke: Plán Výroby + Výroba + Analytics. Project Info read-only (žiadne `Nový projekt`, žiadny inline edit).
   - V Harmonograme drag etáp neprebieha; otvorenie StageDateEditDialog ukáže „Zavřít" namiesto „Uložit".
3. Prepnúť na `pm` → Project Info plne editovateľný, Forecast skrytý (predpoklad: pm má Plán Výroby read), Settings dropdown obmedzený.
4. Prepnúť na `konstrukter` → minimálne práva: žiaden Forecast, žiadny TPV List zápis, Daylog skrytý alebo read-only podľa presetu.
5. „Ukončit simulaci" → bar zmizne, owner vidí všetko.

Pre každý krok urobiť 1 screenshot + porovnať voči tabuľke v `OsobyOpravneni.tsx`. Akékoľvek nezhody zapísať do `.lovable/plan.md` ako follow-up.

## 5) Súbory dotknuté zmenou

- `src/components/PlanDateEditDialog.tsx` (gating Save)
- `src/components/StageDateEditDialog.tsx` (gating Save)
- `src/components/SimulatedRoleBar.tsx` (nový)
- `src/App.tsx` (mount baru pod hlavičkou)
- `src/hooks/useAuth.tsx` (vystaviť `realRole` ak treba)
- `src/components/production/ProductionHeader.tsx` (filter Settings dropdown)

## Akceptačné kritériá

1. Owner v simulácii „Vedoucí PM" vidí žltý info bar a UI presne odpovedá presetu z Oprávnění (Daylog R/W, Forecast prístupný, Project Info R/W, …).
2. Read-only role nemajú v `PlanDateEditDialog` ani `StageDateEditDialog` tlačidlo „Uložit" – len „Zavřít", pickery sú `disabled`.
3. Settings dropdown skryje položky podľa permissions; „Zobrazit jako" len pre realného ownera.
4. „Ukončit simulaci" v bare okamžite vráti owner pohľad bez reloadu.
5. Žiadna regresia pre realného Admina / Ownera / Konstruktéra / Vedoucího výroby.

## Mimo rozsahu

- Per-feature flagy a–h (vytvořit projekt, smazat, dokumenty…) v Project Info detail dialógu – samostatný ticket, ak po vizuálnom overení vyjde najavo, že treba.
- Mobile gating Harmonogramu (mobile drag je už zakázaný globálne).
