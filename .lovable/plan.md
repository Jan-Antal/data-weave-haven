## Diagnóza

V databáze `role_permission_defaults` má rola **admin** nastavené `canManageTPV = false` (zatiaľ čo owner, pm, konstrukter majú `true`). Navyše všetci 4 admin používatelia majú v `user_roles.permissions` explicitný override `canManageTPV: false`, ktorý prebíja aj defaulty.

Dôsledok v TPV List:
- Per-row checkboxy (gated cez `canManageTPV`) sa nezobrazujú
- Status prvku, počet, cena, etapa, poznámky — všetky inputy sú `readOnly={!canManageTPV}` → admin nemôže nič meniť
- Bulk akcie a delete tlačidlá sú skryté

Toast „Uloženo" sa pri zmene statusu nemusí ani objaviť — RLS update beží, ale `canManageTPV` blokuje UI ešte pred odoslaním.

## Riešenie

### 1. DB migrácia — opraviť admin defaulty
```sql
UPDATE public.role_permission_defaults
SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{canManageTPV}', 'true'::jsonb)
WHERE role = 'admin';
```

### 2. DB migrácia — vyčistiť overrides u všetkých admin používateľov
Odstránime kľúč `canManageTPV` z `user_roles.permissions` pre všetkých admin používateľov, aby sa použil opravený default (true). Tým sa zachovajú ostatné individuálne overrides.

```sql
UPDATE public.user_roles
SET permissions = permissions - 'canManageTPV'
WHERE role = 'admin';
```

### 3. Žiadne zmeny v kóde
Statický preset v `permissionPresets.ts` už dáva adminovi `canManageTPV = true` cez `ALL_TRUE`, takže fallback je v poriadku. Komponent `TPVList.tsx` používa `canManageTPV` správne.

## Overenie po nasadení

- Admin obnoví stránku (kvôli novému user_roles fetchu v `useAuth`)
- V TPV List sa zobrazia per-row checkboxy
- Status, počet, cena, etapa a poznámky sa dajú editovať
- Bulk delete a hromadné akcie (selected.size > 0) fungujú

## Dotknuté tabuľky

- `role_permission_defaults` (1 riadok: admin)
- `user_roles` (4 riadky: existujúci admin používatelia)

Žiadne zmeny v zdrojovom kóde — len dáta.
