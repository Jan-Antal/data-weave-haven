
## Zpřístupnění Forecastu pro Admina a Vedoucího výroby

### Cíl
Forecast v **Plánu výroby** nebude dostupný jen pro Ownera, ale pro:

```text
Admin
Vedoucí výroby
Owner
```

Současně se přidá backendové/RLS omezení, aby forecast a jeho zápis nemohl používat jiný uživatel jen tím, že si ručně zavolá funkci nebo obejde UI.

---

## Co upravím

### 1. UI: zobrazit Forecast přepínač pro správné role
V `src/pages/PlanVyroby.tsx` je Forecast přepínač teď navázaný na:

```ts
isOwner
```

Změním to na nové oprávnění, například:

```ts
canUseForecast = isOwner || isAdmin || role === "vedouci_vyroby"
```

A tím se Forecast zobrazí i pro:

- Admin
- Vedoucí výroby

Nezobrazí se pro běžné role typu PM, Mistr, Konstruktér, Viewer, Quality.

### 2. Předat oprávnění do toolbaru
`ToolbarRow2` teď dostává `isOwner`.

Upravím props tak, aby toolbar nepoužíval owner-only logiku, ale jasný příznak:

```ts
canUseForecast
```

Forecast toggle se bude renderovat podle něj.

### 3. Backend ochrana forecast funkcí
Forecast aktuálně běží přes backend funkce:

```text
forecast-schedule
forecast-ai-optimize
```

Doplním kontrolu přihlášeného uživatele z `Authorization` headeru.

Povolené role budou:

```text
owner
admin
vedouci_vyroby
```

Pokud uživatel nemá jednu z těchto rolí, funkce vrátí `403 Forbidden`.

Tím se zabrání tomu, aby někdo mimo povolené role spustil forecast mimo UI.

### 4. RLS / databázové politiky pro zápis forecastu
Forecast při potvrzení zapisuje do výrobních tabulek, hlavně:

```text
production_schedule
production_inbox
```

Zkontroluji a upravím RLS politiky tak, aby zápis potřebný pro forecast uměli:

```text
owner
admin
vedouci_vyroby
```

Konkrétně:

- `production_schedule`: INSERT/UPDATE pro Admin + Vedoucí výroby
- `production_inbox`: UPDATE pro změnu stavu položek po commitnutí forecastu

Použiju existující bezpečný pattern:

```sql
public.has_role(auth.uid(), 'admin'::app_role)
OR public.has_role(auth.uid(), 'owner'::app_role)
OR public.has_role(auth.uid(), 'vedouci_vyroby'::app_role)
```

Role zůstanou uložené v samostatné tabulce `user_roles`, ne v profilu.

### 5. Zachovat čtení pro ostatní role podle současných pravidel
Nezměním běžné čtení plánu výroby.

To znamená:

- kdo dnes vidí Plán výroby, bude ho vidět dál,
- Forecast spouštění a commit bude omezené jen na Admin / Owner / Vedoucí výroby.

### 6. Ošetřit hlášky při zákazu
Pokud někdo bez oprávnění zkusí spustit forecast, UI/backend vrátí jasnou hlášku:

```text
Nemáte oprávnění spustit Forecast.
```

### 7. Aktualizovat paměť projektu
Doplním pravidlo k Forecast modulu:

```text
Forecast v Plánu výroby smí spouštět a commitovat pouze Owner, Admin a Vedoucí výroby. Backend funkce i RLS musí používat stejné omezení.
```

---

## Soubory / změny

### Frontend
- `src/pages/PlanVyroby.tsx`

### Backend funkce
- `supabase/functions/forecast-schedule/index.ts`
- `supabase/functions/forecast-ai-optimize/index.ts`

### Databáze
- nová migrace pro RLS politiky:
  - `production_schedule`
  - `production_inbox`

### Paměť
- `mem://features/production-planning/forecast/overview`

---

## Výsledek

- Admin uvidí a může používat Forecast.
- Vedoucí výroby uvidí a může používat Forecast.
- Ostatní role Forecast neuvidí.
- Backend funkce nepůjdou spustit bez oprávnění.
- Commit forecastu projde přes RLS jen pro povolené role.
- UI oprávnění, backend ochrana i databázové politiky budou sladěné.
