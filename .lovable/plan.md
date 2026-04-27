## Problém

V tabuľkách **Project Info**, **PM Status** a **TPV Status** (sekcia Etapy) je tlačidlo **"Přidat etapu"** a ikona koša pri každej etape gated len cez `canEdit && canWriteProjectInfoTab` (resp. `canWritePMStatusTab`). To znamená, že každý kto môže editovať Project Info, môže aj zakladať a mazať etapy. Mazanie je síce soft-delete (ide do koša 30 dní), ale chýba špecifické oprávnenie.

## Návrh

Pridám **jeden nový permission flag** `canManageStages` ("Spravovať etapy – pridať/mazať"), ktorý kontroluje:
- tlačidlo **"Přidat etapu"** v `ProjectInfoTable.tsx`, `PMStatusTable.tsx`, `TPVStatusTable.tsx` (a `StagesCostSection.tsx` ak má rovnaké tlačidlo)
- ikonu **koša** v riadku etapy v týchto tabuľkách
- prípadne v `StageQuickEditDialog` ak ponúka pridať/zmazať

Dôvod jedného flagu (nie dvoch zvlášť add/delete): aby zoznam oprávnení nenarástol – tieto dve akcie patria k sebe (správa štruktúry projektu).

### Defaultne ZAPNUTÉ pre roly:
- `owner`, `admin` – vždy true (ALL_TRUE / admin override)
- `vedouci_pm` – true (vedie projekty, štandardne mení štruktúru)
- `pm` – true (zakladajú projekty)
- `nakupci` – true (kopíruje PM)
- `vedouci_konstrukter` – true
- `kalkulant` – true (často zakladá štruktúru pri kalkulácii)

### Defaultne VYPNUTÉ:
- `konstrukter` – false (môže editovať polia, ale nie meniť štruktúru etáp)
- `vedouci_vyroby`, `mistr`, `quality`, `viewer`, `finance`, `tester` – false

### Cascade
Pridám `canManageStages` do `MODULE_CASCADE` pod `canAccessProjectInfo` (master Project Info) – ak je modul vypnutý, vypne sa aj toto.

## Technické zmeny

1. **DB migrácia** – update `role_permission_defaults` pre každú rolu (set `canManageStages` v jsonb).
2. **`src/lib/permissionPresets.ts`**:
   - pridať `canManageStages` do `PermissionFlag`, `PERMISSION_FLAGS`, `PERMISSION_LABELS`
   - pridať do `MODULE_CASCADE.canAccessProjectInfo.subs`
   - pridať do `projectInfoFull` helper (aby sa automaticky propagoval do PM/Konštruktér presetov), ale **nie** do `projectInfoReadOnly`
   - explicitne odstrániť z `konstrukter` presetu (preset volá `projectInfoFull` – takže treba upraviť: buď `konstrukter` nedostane cez full, alebo ho dáme samostatne). Najjednoduchšie: pridať do `projectInfoFull` a v `konstrukter` preset to override-núť na false. Riešenie: rozdelím – `projectInfoFull` zostane bez `canManageStages`, a flag pridám explicitne k tým rolám, ktoré ho majú mať.
3. **`src/hooks/useAuth.tsx`** – exportovať `canManageStages` z `usePermissions`.
4. **`src/components/ProjectInfoTable.tsx`** – tlačidlo "Přidat etapu" a ikona koša gated cez `canManageStages` (namiesto/aj okrem `canEdit`).
5. **`src/components/PMStatusTable.tsx`** – to isté (kôš + Přidat etapu).
6. **`src/components/TPVStatusTable.tsx`** – to isté ak má add/delete tlačidlá.
7. **`src/components/StagesCostSection.tsx`** – preveriť a aplikovať.
8. **`src/components/osoby/OsobyOpravneni.tsx`** – flag sa zobrazí automaticky cez `PERMISSION_FLAGS` + `PERMISSION_LABELS`.

## Výsledok

Admin/Owner/PM/Vedúci PM/Nákupčí/Vedúci konštruktér/Kalkulant – môžu pridávať a mazať etapy.
Konštruktér a všetci nižší – tlačidlo "Přidat etapu" zmizne, ikona koša zmizne. Editácia polí etapy zostáva nedotknutá.
Owner môže kedykoľvek toto oprávnenie zmeniť per-rola alebo per-osoba v Osoby → Oprávnenia.