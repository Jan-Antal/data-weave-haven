## Problém

Keď si ako Owner zapneš simuláciu PM v hornej lište, **stále vidíš Analytics**, hoci v Oprávnení je pre PM Analytics vypnuté. Save a DB stav sú správne (overené: všetci 4 reálni PM majú `canAccessAnalytics: false` v `user_roles.permissions` aj v `role_permission_defaults`). Problém je výlučne v `useAuth.tsx`:

```ts
const isSimulating = !!simulatedRole && realRole === "owner";
const permissions = resolvePermissions(effectiveRole, isSimulating ? null : dbPermissions);
```

Pri simulácii sa zámerne **ignorujú DB overrides** a použije sa statický `ROLE_PRESETS.pm` z `permissionPresets.ts`, kde je `canAccessAnalytics` natvrdo zapnuté. Owner teda vidí inú realitu než skutočný PM.

Druhotný problém: ak by sa v budúcnosti vytvoril user bez `permissions` overrides (čerstvá rola), padne na ten istý statický preset → opäť divergencia od `role_permission_defaults` v DB.

## Plán opravy

### 1. `useAuth.tsx` — načítať `role_permission_defaults` z DB
- Pri každom prihlásení (alebo reaktívne pri zmene `effectiveRole`) načítať z `role_permission_defaults` riadok pre `effectiveRole` a uložiť do stavu `roleDefaults: Partial<Permissions> | null`.
- Realtime subscription na `role_permission_defaults` (UPDATE/INSERT) cez existujúci `useRealtimeSync` alebo dedikovaný kanál, aby zmena v Oprávnení okamžite premietla aj bez F5.

### 2. Nová resolve poradie (zhora nadol víťazí prvé)
1. **DB user override** (`user_roles.permissions`) — ale iba pre **reálneho** usera, NIE pri simulácii.
2. **DB role default** (`role_permission_defaults`) — vždy, tj. aj počas simulácie.
3. **Statický preset z kódu** (`ROLE_PRESETS`) — len ako bezpečnostný fallback, ak DB defaults chýbajú.

Implementácia v `useAuth.tsx`:
```ts
const dbDefaults = roleDefaults; // načítané z role_permission_defaults pre effectiveRole
const userOverrides = isSimulating ? null : dbPermissions;
const permissions = resolvePermissions(
  effectiveRole,
  // merge: defaults najprv, potom user overrides ich pretlačia
  { ...(dbDefaults ?? {}), ...(userOverrides ?? {}) }
);
```
`resolvePermissions` upraviť tak, aby `ROLE_PRESETS` bol **iba fallback** pre flag, ktorý chýba aj v DB (zatiaľ to vďaka tomu funguje pre nové flagy ako `canAccessTpv`, ale v DB defaults už `canAccessTpv` je všade).

### 3. `OsobyOpravneni.tsx` — load draft z `role_permission_defaults`
Aktuálne `useEffect` číta override z prvého usera v `roles` poli. Toto je nespoľahlivé (závisí od existencie usera v role) a líši sa od toho, čo sa použije v simulácii. Zmeniť tak, aby:
- Najprv načítal `role_permission_defaults` z DB pre `selectedRole` cez `useQuery`.
- `draftPerms` = `{ ...ROLE_PRESETS[selectedRole], ...rolePermissionDefaults }`.
- Pri Save (už hotové) updatovať `user_roles` aj `role_permission_defaults` (zachovať existujúce správanie).

### 4. Audit ostatných miest s tvrdou rolou
Rýchla revízia, či nikde inde sa nerobí logika typu „ak rola = pm tak ukáž X" mimo `useAuth`:
- `Index.tsx`, `MobilePrehled.tsx`, `DashboardStats.tsx` — overiť, či používajú permission flagy a nie `isPM`/`isAdmin` tam, kde by to malo byť granular.
- Cieľ: jediný zdroj pravdy = `permissions` z `useAuth`.

### 5. Verifikácia (po implementácii)
1. Owner si zapne simuláciu PM → Analytics ikona v hlavičke **zmizne**, `/analytics` route presmeruje na `/`.
2. Owner si v Oprávnení vypne pre PM `canAccessPlanVyroby` → save → reálnemu PM po refreshi (alebo realtime) zmizne Plán Výroby.
3. Owner si zapne pre PM `canAccessAnalytics` → save → reálnemu PM aj simulácii sa Analytics objaví.
4. SQL kontrola: `SELECT role, permissions FROM role_permission_defaults` vráti zmeny; `SELECT permissions FROM user_roles WHERE role='pm'` má rovnaké hodnoty.

## Dotknuté súbory
- `src/hooks/useAuth.tsx` — pridať load `role_permission_defaults`, upraviť resolve poradie.
- `src/lib/permissionPresets.ts` — drobná úprava `resolvePermissions` (akceptovať merged objekt).
- `src/components/osoby/OsobyOpravneni.tsx` — draft z DB defaults namiesto z prvého usera.
- `src/hooks/useRealtimeSync.ts` — pridať subscription na `role_permission_defaults` (invalidate query).

Žiadna DB migrácia nie je potrebná — schéma a dáta sú správne, opravujeme len frontend logiku.