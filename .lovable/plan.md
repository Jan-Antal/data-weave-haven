
## Plán opravy oprávnění pro roli Owner

### Cíl
Zajistím, že roli **Owner** může spravovat pouze aktuální **Owner**.

Admin nebude moct:
- vidět roli **Owner** v záložce **Oprávnění**,
- přidávat uživatele do role **Owner**,
- odebrat uživatele z role **Owner**,
- měnit oprávnění role **Owner**,
- změnit Ownerovi roli, deaktivovat ho, změnit mu heslo nebo jinak spravovat jeho účet.

Owner bude dál moct:
- vidět roli **Owner**,
- upravovat oprávnění Owner role,
- spravovat uživatele v Owner roli,
- předat vlastnictví jinému uživateli.

---

## 1. Úprava UI v `OsobyOpravneni`

### Soubor
`src/components/osoby/OsobyOpravneni.tsx`

Doplním použití `useAuth()` a podle `isOwner` upravím seznam rolí.

### Chování

#### Pokud je přihlášený Owner
Uvidí vše jako dnes:

```text
Owner
Admin
Vedoucí PM
PM
...
```

#### Pokud je přihlášený Admin
Role **Owner** se v levém seznamu vůbec nezobrazí:

```text
Admin
Vedoucí PM
PM
...
```

Admin se tedy nedostane na detail Owner role a neuvidí ani její přiřazené uživatele.

### Ochrana akcí
Přidám i ochranu v samotných handlerech:

- `handleSave`
- `persistSave`
- `handleAddUser`
- `handleRemoveUser`

Pokud by se admin nějak dostal k `selectedRole === "owner"`, akce se zastaví a zobrazí se chyba:

```text
Roli Owner může spravovat pouze Owner.
```

Tím nebude ochrana závislá jen na skrytém UI.

---

## 2. Úprava defaultní vybrané role

Aktuálně komponenta začíná na:

```ts
selectedRole = "pm"
```

Upravím to tak, aby:

- Owner mohl začínat klidně na Owner/Admin podle stávající logiky,
- Admin nikdy nezačínal ani nepřepnul na `owner`.

Pokud se role seznam změní, komponenta automaticky přepne na první dostupnou roli.

---

## 3. Backend ochrana přes databázové policies

### Důvod
Teď existuje policy, která dovoluje adminům spravovat `user_roles`. To je příliš široké, protože UI sice můžeme skrýt, ale bezpečnost musí být i na úrovni backendu.

### Změna
Připravím migraci pro `user_roles`, která rozdělí práva takto:

#### Owner
Může:
- číst všechny role,
- vkládat všechny role,
- měnit všechny role,
- mazat všechny role.

#### Admin
Může:
- číst a spravovat pouze ne-Owner role,
- nemůže vložit `role = 'owner'`,
- nemůže upravit existující Owner řádek,
- nemůže změnit libovolného uživatele na Ownera,
- nemůže smazat Owner roli.

Princip policies:

```sql
-- Admin smí spravovat jen role, kde role <> 'owner'
USING (
  has_role(auth.uid(), 'admin')
  AND role <> 'owner'
)

WITH CHECK (
  has_role(auth.uid(), 'admin')
  AND role <> 'owner'
)
```

Owner bude mít samostatnou policy bez tohoto omezení.

---

## 4. Zabezpečení backend funkcí

### Soubor
`supabase/functions/update-user/index.ts`

Doplním kontrolu cílového uživatele hned po načtení `user_id`.

Pokud cílový uživatel má roli `owner` a volající není `owner`, funkce vrátí chybu:

```text
Only Owner can manage Owner account.
```

Tím admin nebude moct přes funkci:
- změnit Ownerovi jméno,
- změnit Ownerovi heslo,
- deaktivovat Ownera,
- změnit Ownerovi roli,
- odebrat mu oprávnění přes změnu role.

Ponechám stávající pravidlo, že převod vlastnictví (`transfer_ownership_to`) smí spustit pouze Owner.

### Soubor
`supabase/functions/generate-invite-link/index.ts`

Doplním kontrolu, že pokud cílový uživatel je Owner, link může vygenerovat pouze Owner.

### Soubor
`supabase/functions/delete-user/index.ts`

Už teď blokuje smazání Ownera. Nechám zachované, případně zpřesním chybovou hlášku.

### Soubor
`supabase/functions/create-user/index.ts`

Owner se přes běžné vytvoření uživatele dál nebude dát vytvořit. Owner vznikne pouze přes řízený převod vlastnictví.

Zároveň sjednotím seznam validních rolí ve funkcích s aktuálními rolemi aplikace, ale `owner` zůstane z běžného přiřazování vyloučený.

---

## 5. Úprava `UserManagement`

### Soubor
`src/components/UserManagement.tsx`

Doplním rozlišení mezi Ownerem a Adminem.

#### Pro Admina
Owner účet bude chráněný:

- nebude možné měnit jméno Ownera,
- nebude možné měnit heslo Ownera,
- nebude možné generovat invite/reset link Ownerovi,
- nebude možné deaktivovat Ownera,
- nebude možné odstranit Ownera,
- nebude vidět akce pro předání vlastnictví.

Owner se může zobrazit jen jako uzamčený řádek, například:

```text
Owner    chráněný účet
```

nebo ho pro admina úplně skryji ze seznamu uživatelů podle toho, co bude v aktuálním UI čistší.

#### Pro Ownera
Zůstane možnost:
- spravovat ostatní uživatele,
- předat vlastnictví,
- vidět Owner účet.

---

## 6. Očekávané chování po opravě

### Admin v záložce Oprávnění
Uvidí:

```text
Admin
Vedoucí PM
PM
Konstruktér
...
```

Neuvidí:

```text
Owner
```

Nemůže tedy přidat nikoho do Owner role ani upravit Owner oprávnění.

### Owner v záložce Oprávnění
Uvidí:

```text
Owner
Admin
Vedoucí PM
PM
...
```

Může Owner roli spravovat.

### Přímý pokus přes API / klienta
Pokud by admin obešel UI a pokusil se změnit `user_roles` přímo, databázová pravidla změnu odmítnou.

---

## 7. Ověření

Po implementaci ověřím:

1. Admin nevidí roli Owner v `Osoby → Oprávnění`.
2. Admin nemůže přidat uživatele do Owner role.
3. Admin nemůže odebrat aktuálního Ownera z Owner role.
4. Admin nemůže změnit oprávnění Owner role.
5. Admin nemůže přes správu uživatelů změnit Ownerovi heslo, aktivitu ani účet.
6. Owner stále vidí Owner roli.
7. Owner stále může předat vlastnictví.
8. Přímá databázová ochrana blokuje admin změny na `role = 'owner'`.
9. Build projde bez TypeScript chyb.
