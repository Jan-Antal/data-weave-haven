# Pridanie záložky Absence do oprávnení

V Analytics pribudla záložka **Absence**, ale chýba pre ňu samostatný permission flag — aktuálne sa zobrazuje pod `canAccessAnalyticsVykaz`. Pridám dedikovaný flag a doplním ho do všetkých rolí + cascade pravidla.

## Zmeny

### 1. `src/lib/permissionPresets.ts`
- Pridať `canAccessAnalyticsAbsence` do `PermissionFlag` typu, `PERMISSION_FLAGS[]` a `PERMISSION_LABELS` (label: „Záložka: Absence").
- Doplniť do `MODULE_CASCADE` pod master `canAccessAnalytics`.
- Doplniť do helpera `analyticsFull[]`, aby ho dostali role s plným prístupom k Analytics.

### 2. `src/hooks/useAuth.tsx`
- Pridať `canAccessAnalyticsAbsence: boolean` do `Permissions` interface a do návratového objektu `usePermissions`.

### 3. `src/pages/Analytics.tsx`
- V definícii tabov zmeniť `{ key: "absence", visible: canAccessAnalyticsVykaz }` na `visible: canAccessAnalyticsAbsence`.
- Pridať guard pre `absenceMode` (presmerovanie / hide ak nemá flag).

### 4. Migrácia: defaults v `role_permission_defaults`
Doplniť `canAccessAnalyticsAbsence` do JSONB pre každú rolu:
- **true:** `owner`, `admin`, `vedouci_pm`, `pm`, `nakupci`, `finance`, `vedouci_konstrukter`, `vedouci_vyroby`, `mistr`, `kalkulant`, `tester`
- **false:** `konstrukter`, `vyroba`, `quality`, `viewer`

(Absence sú HR/manažérske dáta — výrobní operátori a viewer ich nepotrebujú.)

## Pravidlo do pamäte

Uložím nové memory pravidlo: **„Každá nová záložka v ktoromkoľvek module musí dostať vlastný `canAccess...` flag v `permissionPresets.ts`, byť pridaná do `MODULE_CASCADE` pod správny master, do `usePermissions` hooku, do migrácie `role_permission_defaults` pre všetky role, a UI musí túto záložku gateovať cez `useAuth()`."**

## Otázka pred implementáciou

Pre rolu **Finance** (vidí ceny, inak viewer) — má vidieť aj záložku Absence? Predpokladám **áno** (finančné/HR reporting), ale potvrď ak nie.
