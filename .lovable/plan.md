

## Diagnóza: Prečo PM nevidí Správu osôb

### Hlavná príčina (front-end gating)
PM klikne na "Správa osob" v hlavičke → `navigate('/osoby')`. V `src/App.tsx` je route gating:

```ts
function AdminRoute({ children }) {
  const { isAdmin, isOwner, isVyroba } = useAuth();
  if (!isAdmin && !isOwner && !isVyroba) return <Navigate to="/" replace />;
  ...
}
<Route path="/osoby" element={<AdminRoute>...</AdminRoute>} />
```

PM nie je `admin/owner/vyroba` → **redirect na `/`**. Stránka sa vôbec neotvorí, žiadne RLS volanie sa nestihne urobiť. To je dôvod, prečo "sa neotvorí" Externisti.

Druhá vrstva, ktorá by ho aj tak zatvorila: dropdown v `ProductionHeader` ukazuje "Správa osob" len ak `canManageUsers || canManagePeople`. PM má `canManagePeople = true` (preset), takže sa link zobrazí — ale klik vyhodí redirect.

### RLS audit (čo som overil cez `supabase--read_query`)

| Tabuľka | RLS status | Pre PM |
|---|---|---|
| `people` | SELECT všetkým authenticated; INSERT/UPDATE owner/admin/pm/konstrukter; DELETE owner/admin/pm | OK — PM môže čítať aj editovať externistov |
| `ami_employees` | SELECT všetkým authenticated; INSERT/UPDATE/DELETE iba owner/admin | PM by **nemohol editovať** zamestnancov, iba čítať (čo dáva zmysel — PM nespravuje úväzky) |
| `position_catalogue` | INSERT/UPDATE/DELETE iba owner/admin | OK pre admin tabs (PM ich aj tak nemá vidieť) |
| `production_capacity` / `..._employees` | INSERT/UPDATE/DELETE iba owner/admin | OK |
| `ami_absences` | INSERT/UPDATE/DELETE iba owner/admin | OK |
| `user_roles` | SELECT/manage iba admin/owner | OK |
| `profiles` | SELECT/UPDATE iba admin/owner (okrem own profile) | OK |

**Záver:** RLS pre `people` je správne nastavené pre PM. Iba route guard a viditeľnosť tabov sú zle.

### Vedľajšia drobnosť (nesúlad UI vs DB)
- `OsobyZamestnanci` má inline editovateľné polia (úväzok, pozícia atď.) — PM ich uvidí ako editovateľné, ale UPDATE na `ami_employees` mu RLS odmietne (a vyhodí toast chybu). Tab "Zaměstnanci" by mal byť pre PM read-only alebo skrytý.

---

## Plán opravy

### Zmena 1 — povoliť PM (a Konstruktérom) prístup na `/osoby`

`src/App.tsx`, `AdminRoute`: rozšíriť o role, ktoré majú `canManagePeople` alebo `canManageExternisti` (PM, vedouci_pm, konstrukter, vedouci_konstrukter):

```ts
function AdminRoute({ children }) {
  const { isAdmin, isOwner, isVyroba, isPM, isKonstrukter, canManagePeople, canManageExternisti } = useAuth();
  const allowed = isAdmin || isOwner || isVyroba || isPM || isKonstrukter
                  || canManagePeople || canManageExternisti;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

Lepšie ešte: rozdeliť AdminRoute do dvoch — `AdminRoute` pre `/analytics` a `/vyroba`, a nový `PeopleRoute` pre `/osoby` ktorý kontroluje `canManagePeople || canManageExternisti || canManageUsers`. Ale jednoduchší fix vyššie stačí.

### Zmena 2 — `Osoby.tsx` viditeľnosť tabov podľa role

Aktuálne `defaultTab="zamestnanci"` a všetci tam padnú. PM by mal po príchode vidieť **Externisti** (jeho hlavný use-case). Použiť `defaultTab` podľa role:

```ts
const defaultTab = canSeeAdminTabs ? "zamestnanci" : "externisti";
```

Tab `Zaměstnanci` ponechať viditeľný (PM môže aj tak iba čítať) — alebo skryť pre non-admins, keďže väčšina interakcií je editačná. Navrhujem **skryť** pre PM:

```ts
{ key: "zamestnanci", label: "Zaměstnanci", visible: canSeeAdminTabs },
{ key: "externisti", label: "Externisté" },  // všetci s prístupom
```

### Zmena 3 — `OsobyExternisti` rešpektovať `canManageExternisti`

Tlačidlá "Přidat externistu", inline editácie a delete sú momentálne aktívne pre každého. Pridať `disabled` / skryť ak `!canManageExternisti`. Pre PM `canManageExternisti = true` (preset), takže reálne sa nič nezmení — len bezpečnostne čisté pre prípadné budúce role.

### Súbory

- `src/App.tsx` — rozšíriť `AdminRoute`
- `src/pages/Osoby.tsx` — `defaultTab` podľa role + `visible` pre `zamestnanci`
- `src/components/osoby/OsobyExternisti.tsx` — gating tlačidiel cez `canManageExternisti`

### Bez DB zmien
RLS netreba meniť. Aktuálne policies sú správne — iba front-end ich blokoval predtým, než sa stihli vyvolať.

