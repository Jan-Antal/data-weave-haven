# TPV — Technická Příprava Výroby

Plne izolovaný modul pre **TPV sekciu** v AMI Hub. Skladá sa z 5 tabov:
**Príprava**, **Subdodávky**, **Materiál**, **Hodiny**, **Dodávatelia (CRM)**.

## Vzťah k Project Info

TPV modul je **vrstva 2** nad Project Info (vrstva 1 vznikla skôr).

- `tpv_items` (TPV List) je **vlastnená Project Info modulom**.
  TPV modul ich len číta cez `TpvItemRef` typy a `TpvItemRefDisplay` komponent
  (read-only s linkom "Otvoriť v Project Info").
- `projects` rovnako — len read-only refs.
- Vlastné tabuľky TPV modulu: `tpv_subcontract`, `tpv_subcontract_request`,
  `tpv_supplier`, `tpv_supplier_contact`, `tpv_supplier_pricelist`,
  `tpv_supplier_task`, `tpv_audit_log`, `tpv_material`, `tpv_hours_allocation`,
  `tpv_preparation`, `tpv_project_preparation`.

## Štruktúra

```
src/components/tpv/
├── index.ts                    ← public entry: TpvModule, types, helpers
├── TpvModule.tsx               ← root container s tab switcherom
├── shared/                     ← spoločné medzi všetkými tabmi
│   ├── types.ts                ← AppRole, TpvPermissions, TpvItemRef, ProjectRef,
│   │                              TpvSupplierRow, audit types, Mena
│   ├── helpers.ts              ← formatMoney/Date, computePermissions
│   ├── api/{audit,tpv-items,projects}.ts   ← read-only fetchery
│   ├── hooks/index.ts          ← useTpvItem, useProject, audit hooks
│   ├── components/
│   │   ├── AuditTrail.tsx              ← generický s `valueFormatter` prop
│   │   ├── TpvItemRefDisplay.tsx       ← read-only ref display + link
│   │   └── ProjectRefDisplay.tsx
│   └── index.ts                ← barrel
│
├── priprava/                   ← Príprava tab (placeholder, plánované features popísané vnútri)
│   ├── PripravaTab.tsx
│   └── index.ts
│
├── subdodavky/                 ← Subdodávky tab (kompletne implementované)
│   ├── types.ts                ← subcontract-only types + SubcontractPermissions
│   ├── helpers.ts              ← STAV_LABELS, computeStatusStrip, classify, group
│   │                              + re-export shared formatters
│   ├── api/{index,excel}.ts
│   ├── hooks/index.ts
│   ├── components/             ← SubdodavkyTab + dialógy
│   └── index.ts
│
├── material/                   ← Materiál tab (placeholder)
├── hodiny/                     ← Hodiny tab (placeholder)
└── dodavatelia/                ← Dodávatelia CRM tab
    ├── types.ts                ← contact, pricelist, task types
    ├── api.ts
    ├── hooks.ts                ← CRM mutations
    ├── hooks-list.ts           ← list všetkých dodávateľov pre tab body
    ├── DodavateliaTab.tsx      ← grid kariet dodávateľov + filter + open CRM modal
    ├── SupplierCRMDialog.tsx   ← 5-pane CRM dialog (Prehľad/Kontakty/Zákazky/Cenník/Úlohy)
    ├── panes/                  ← OverviewPane, ContactsPane, JobsPane, PricelistPane, TasksPane
    └── index.ts
```

## Použitie v parent app

```tsx
import { TpvModule } from "@/components/tpv";
import { useAuth } from "@/hooks/useAuth";

export default function TpvPage() {
  const { roles } = useAuth();
  return <TpvModule roles={roles} initialTab="subdodavky" />;
}
```

## Permissions model

`computePermissions(roles)` v `shared/helpers.ts` produkuje `TpvPermissions`
ktoré sa odovzdávajú každému tabu. Subdodávky tab používa `SubcontractPermissions`
projekciu cez `subcontractPermissionsFromTpv()`.

Reálne roly (overené z `app_role` enumu 26.4.2026):
`owner, admin, pm, konstrukter, viewer, tester, vyroba, vedouci_pm,
vedouci_konstrukter, vedouci_vyroby, mistr, quality, kalkulant, nakupci`.

`nakupci` je pridaný našou migráciou.

## Filozofia

Tento modul je **napísaný mimo Lovable**. Lovable do neho nezasahuje, pokiaľ
nedostane explicitnú inštrukciu. Toto rieši opakované problémy s tým, že
Lovable prepisuje sofistikovanejšiu logiku pri generických promptoch.

**Vizuál** (paddingy, spacing, presné odtiene) môžeš doladiť v Lovable po
deploy — kód je postavený na shadcn/ui, takže každá úprava designu sa
prejaví automaticky.

## Štruktúra

```
src/components/tpv/subdodavky/
├── index.ts                          ← public API (exporty)
├── README.md                         ← tento súbor
├── types/
│   └── index.ts                      ← TypeScript types matchujúce DB
├── api/
│   └── index.ts                      ← Supabase queries (typed)
├── hooks/
│   └── index.ts                      ← React Query hooks
├── lib/
│   └── helpers.ts                    ← grouping, formatting, status mapping
└── components/
    ├── SubdodavkyTab.tsx             ← main entry point ⭐
    ├── PerProjectView.tsx            ← grouped accordion per projekt
    ├── PerSupplierView.tsx           ← grouped per dodávateľ
    ├── NewSubcontractDialog.tsx      ← 4-step wizard (RFQ alebo direct)
    ├── SubcontractDetailDialog.tsx   ← detail + edit + RFQ akcie
    ├── QuoteCompareDialog.tsx        ← porovnanie ponuk + výber víťaza
    ├── SupplierPicker.tsx            ← single + multi supplier picker
    └── StatusBadge.tsx               ← stav pills + type pill A/B
```

## Integrácia do hlavnej aplikácie

### 1. Skopíruj modul

Skopíruj celú zložku `src/components/tpv/subdodavky/` do svojho repa
`Jan-Antal/data-weave-haven`. Žiadne ďalšie súbory mimo tejto zložky modul
neupravuje.

### 2. Použi v `Tpv.tsx`

```tsx
import { SubdodavkyTab, computePermissions } from "@/components/tpv/subdodavky";
import { useAuth } from "@/hooks/useAuth"; // existujúci hook v appke

export default function Tpv() {
  const { roles } = useAuth();
  const permissions = computePermissions(roles);

  // tvoja logika modal Supplier CRM (z Dodávatelia tabu)
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);

  return (
    <Tabs defaultValue="subdodavky">
      <TabsList>
        <TabsTrigger value="prehlad">Prehľad pipeline</TabsTrigger>
        <TabsTrigger value="material">Materiál</TabsTrigger>
        <TabsTrigger value="subdodavky">Subdodávky</TabsTrigger>
        <TabsTrigger value="dodavatelia">Dodávatelia</TabsTrigger>
        <TabsTrigger value="hodiny">Hodinová dotácia</TabsTrigger>
      </TabsList>

      <TabsContent value="subdodavky">
        <SubdodavkyTab
          permissions={permissions}
          onOpenSupplier={setOpenSupplierId}
        />
      </TabsContent>

      {/* Ostatné taby... */}

      {/* Supplier CRM modal sa rendruje raz tu, používa ho aj Subdodávky */}
      {openSupplierId && (
        <SupplierCRMDialog
          supplierId={openSupplierId}
          open={!!openSupplierId}
          onOpenChange={(o) => !o && setOpenSupplierId(null)}
        />
      )}
    </Tabs>
  );
}
```

### 3. Embed do Project Info (voliteľné)

Modul vie fungovať aj scoped na jeden projekt — užitočné v ProjectDetailDialog:

```tsx
<SubdodavkyTab
  permissions={permissions}
  onOpenSupplier={setOpenSupplierId}
  scopedProjectId={project.project_id}
/>
```

V tomto režime sa skryje filter projektov a "Nová subdodávka" rovno predvolí
projekt.

## Závislosti

Všetky závislosti, ktoré modul používa, sú už v `data-weave-haven`:

- `@tanstack/react-query`
- `@/integrations/supabase/client`
- `sonner` (toast)
- `lucide-react` (icons)
- `@/components/ui/*` (shadcn primitives — Button, Dialog, Select, Input,
  Label, Textarea, Table, Badge, Popover, Command, ToggleGroup)
- `@/lib/utils` (`cn()` helper)

**Nič nového netreba inštalovať.**

## DB závislosti

Modul počíta s týmito tabuľkami v Supabase (existujúce):

| Tabuľka                      | Použitie                                |
| ---------------------------- | --------------------------------------- |
| `tpv_subcontract`            | Hlavná tabuľka subdodávok               |
| `tpv_subcontract_request`    | RFQ ponuky (1 subcontract → N requests) |
| `tpv_supplier`               | Dodávatelia (CRM data)                  |
| `tpv_items`                  | TPV prvky (pre tpv_item_id picker)      |
| `projects`                   | Projekty (pre project_id picker)        |

### Foreign key názvy

API queries používajú menné FK constrainty:

- `tpv_subcontract_dodavatel_id_fkey` → `tpv_supplier`
- `tpv_subcontract_tpv_item_id_fkey` → `tpv_items`
- `tpv_subcontract_project_id_fkey` → `projects`
- `tpv_subcontract_request_supplier_id_fkey` → `tpv_supplier`

**Skontroluj v Supabase, či tieto FK názvy odpovedajú reálnemu DB schémátu.**
Ak nie, uprav reťazce v `api/index.ts` (sekcie `supplier:tpv_supplier!...`).

Otvor v Supabase SQL Editor a spusti:

```sql
SELECT conname, conrelid::regclass AS tablename
FROM pg_constraint
WHERE conrelid::regclass::text LIKE 'tpv_%'
  AND contype = 'f'
ORDER BY conrelid::regclass::text, conname;
```

Ak sa FK volajú inak, prepíš v `api/index.ts` reťazce v `.select()`
volaniach. Toto je jediná miesto, kde sa môže lišiť integrácia.

### RLS policies

Modul **nezavádza** RLS policies — predpokladá, že existujú a sú postavené
na `has_role(auth.uid(), 'role')` pattern, ktorý už appka používa.
Permissions v UI (`computePermissions`) sú **defense in depth** — RLS je
autoritatívny.

Minimum potrebných RLS policies (pseudokód):

```sql
-- READ: každý prihlásený
CREATE POLICY "auth users can read tpv_subcontract"
  ON tpv_subcontract FOR SELECT TO authenticated USING (true);

-- WRITE: pm, nakupci, admin, owner
CREATE POLICY "pm/nakupci/admin can write tpv_subcontract"
  ON tpv_subcontract FOR ALL TO authenticated
  USING (
    has_any_role(auth.uid(),
      ARRAY['pm','nakupci','admin','owner']::app_role[])
  );

-- Analogické pre tpv_subcontract_request a tpv_supplier.
```

## Workflow — čo modul podporuje

### A) Rýchle zadanie (direct)

1. Klik na **Nová subdodávka**
2. Krok 1: vyplň projekt, operáciu, množstvo, cenu
3. Krok 2: vyber **Rýchle zadanie**
4. Krok 3: vyber 1 dodávateľa
5. Krok 4: review → **Vytvoriť**

→ Vznikne subdodávka so stavom `awarded`. PM ju potom označí ako
`ordered` a po dodaní `delivered`.

### B) RFQ flow

1. Klik na **Nová subdodávka**
2. Krok 1: vyplň zadanie
3. Krok 2: vyber **Cez dopyt (RFQ)**
4. Krok 3: vyber **2+ dodávateľov** + voliteľná poznámka
5. Krok 4: review → **Vytvoriť a rozposlať RFQ**

→ Vznikne subdodávka stav `rfq_pending` + N RFQ requests stav `pending`.

6. Akonáhle dodávatelia odpovedia, PM otvorí detail subdodávky a klikne
   **Zadať ponuku** pri každom request → cena/termín/poznámka.
7. Keď je aspoň jeden request `received`, klikne **Porovnať & vybrať** →
   QuoteCompareDialog.
8. Vyberie víťaza → automaticky:
   - Vybraný request: stav `awarded`, ostatné `rejected`
   - Subcontract: dodavatel_id naplnené, stav `awarded`,
     cena_finalna = vybraná ponuka

## Permissions matrix

```
           | view | create | edit | delete | sendRFQ | awardRFQ |
-----------|------|--------|------|--------|---------|----------|
owner      |  ✓   |   ✓    |  ✓   |   ✓    |    ✓    |    ✓     |
admin      |  ✓   |   ✓    |  ✓   |   ✓    |    ✓    |    ✓     |
pm         |  ✓   |   ✓    |  ✓   |   ✓    |    ✓    |    ✓     |
nakupci    |  ✓   |   ✓    |  ✓   |        |    ✓    |          |
kalkulant  |  ✓   |        |      |        |         |          |
konstrukter|  ✓   |        |      |        |         |          |
viewer     |  ✓   |        |      |        |         |          |
vedouci_v. |  ✓   |        |      |        |         |          |
```

## Známe limity / TODO

- **Type A/B (free-issue vs buy-finished)** je odvodený heuristicky z
  textu nazov/popis. Pre presné riešenie pridať do DB stĺpec
  `tpv_subcontract.typ_spoluprace` (text 'A' | 'B').
- **Award RFQ** je client-side multi-step (3 update queries). Pri vysokej
  konkurencii možný race condition. V budúcnosti zabaliť do Postgres
  funkcie `award_rfq_request(request_id uuid)` pre atomicitu.
- **Notifikácie** (Slack webhook, in-app) nie sú v tomto module — mali by
  ich vyvolávať database triggers alebo edge functions, nie UI kód.
- **Excel import / export** nie je v tomto module — patrí do Materiál tabu.
- **Supplier CRM modal** sa otvára z parenta (Dodávatelia tab) cez
  `onOpenSupplier(id)`. Modul ho vlastní len kontextovo.

## Testovanie po deploy

Po commite a deploy v Lovable, otestuj postupne:

1. ☐ `/tpv` route načíta sa, "Subdodávky" tab je viditeľný
2. ☐ Per-projekt accordion: klik rozbalí, prvé 3 projekty sú default
   rozbalené
3. ☐ Per-dodávateľ view: zobrazí dodávateľov s aspoň jednou subdodávkou
4. ☐ Filter: zmena projektu/stavu/search filtruje výsledky
5. ☐ "Nová subdodávka" → Rýchle zadanie flow → subdodávka vznikne
6. ☐ "Nová subdodávka" → RFQ flow → subdodávka + N requests vzniknú
7. ☐ Detail subdodávky → "Zadať ponuku" → ponuka sa uloží, stav sa zmení
   na `received`
8. ☐ Detail subdodávky → "Porovnať & vybrať" → víťaz sa vyberie,
   subcontract dostane dodavatel_id
9. ☐ "Označiť ako objednané" / "Označiť ako dodané" mení stavy
10. ☐ Permissions: viewer účet nevidí akčné tlačidlá
11. ☐ Mobile responsive: filtre a tabuľky sú použiteľné na užšom view

## Ladenie vizuálu v Lovable

Po deploy môžeš v Lovable promptnúť napríklad:

> "V `src/components/tpv/subdodavky/components/PerProjectView.tsx` priprav
> hover efekt na project group header — jemný amber background pri hover,
> ako máš v PM Status table. Nesahaj na žiadne iné súbory v module."

Modul je zámerne izolovaný od zvyšku aplikácie — Lovable nemá dôvod
prepisovať veci mimo `subdodavky/` zložky.

## Otázky pri integrácii

Ak narazíš na problém pri commite alebo behu, najpravdepodobnejšie príčiny:

1. **FK names mismatch** → uprav `api/index.ts` Supabase select strings
2. **shadcn component chýba** → niektorá ui zložka (napr. ToggleGroup) nemusí
   byť v projekte; pridaj cez `npx shadcn-ui@latest add toggle-group`
3. **`@tanstack/react-query` provider chýba** → musí byť obalený nad celou
   appkou v `App.tsx` / `main.tsx`
4. **`useAuth` hook vracia iný shape** → uprav volanie `computePermissions`
   v `Tpv.tsx`

---

# Phase 2 dodatky (Apríl 2026)

Po Phase 1 (základné Subdodávky) bol modul rozšírený o tri väčšie funkcie.

## 1. Audit log / História zmien

Vlastná tabuľka `tpv_audit_log` zachytáva každý INSERT/UPDATE/DELETE
v `tpv_subcontract`, `tpv_subcontract_request` a `tpv_supplier`.

### Architektúra

- **Postgres triggery** robia diff old/new a zapisujú len zmenené polia
  (nie celý riadok) → audit log zostáva malý.
- Triggery sú **`SECURITY DEFINER`** — bežia s právami vlastníka tabuľky,
  takže klient nemá ako audit obísť alebo upraviť.
- Klient má len **read** policy na `tpv_audit_log`. Nikdy tam nezapisuje.
- Denormalizované polia `subcontract_id`, `supplier_id`, `project_id` sú
  doplnené triggerom, takže filtrovanie histórie je jeden indexový lookup
  bez joinov.
- Pre stav-prechody sa generuje `summary` ako "Stav: rfq_pending → awarded".

### Zobrazenie

- **Subcontract detail dialog** → tlačidlo „História" v hlavičke prepne
  obsah na timeline view.
- **Supplier CRM modal** → to isté tlačidlo „História" prepína na audit log
  pre dodávateľa.
- Komponent `AuditTrail` je samostatný a re-použiteľný — môžeš ho hodiť
  hocikam (napr. activity panel v Project Info).

```tsx
import { AuditTrail, useSubcontractAuditTrail } from "@/components/tpv/subdodavky";

const { data: entries = [], isLoading } = useSubcontractAuditTrail(subId);
return <AuditTrail entries={entries} isLoading={isLoading} />;
```

### Limity

- Audit log si **nepamätá actor_name** ak je auth.users prázdne — len
  `actor_email`. Ak ti záleží na mene aj po deaktivácii usera, potrebuješ
  vlastnú `profiles` tabuľku a malou úpravou triggera doplniť snapshot mena.
- **`updated_at`** je v triggera explicitne ignorovaný (inak by každá zmena
  generovala 2 zápisy).
- **DataLog vs tpv_audit_log** — to sú dve separátne veci. Existujúci
  `data_log` (Project Info activity panel) zostáva nedotknutý.
  `tpv_audit_log` je špecificky pre TPV modul.

## 2. Supplier CRM modal (5 tabov)

`<SupplierCRMDialog>` — globálny modal otvárateľný odkiaľkoľvek pomocou
`supplierId`. Parent ho mountuje raz a Subdodávky tab cez callback otvára.

### Taby

| Tab | Obsah |
|-----|-------|
| **Prehľad** | 4 KPI karty (aktívne zákazky, on-time rate, ⌀ leadtime, obrat YTD) + základné údaje (editovateľné inline) + rating/kategórie + interná poznámka |
| **Kontakty** | Multiple kontakty per dodávateľ (`tpv_supplier_contact`), jeden môže byť `is_primary` (DB-level unique partial index) |
| **Zákazky** | Read-only zoznam všetkých subdodávok pre dodávateľa, filtre Všetky / Aktívne / Dodané / Zrušené |
| **Cenník** | `tpv_supplier_pricelist` — položky zoskupené podľa kategórie, expirované sa zobrazujú prečiarknuté |
| **Úlohy** | `tpv_supplier_task` — todos s prioritou (low/normal/high/urgent) a termínom; checkbox toggle |

### KPI výpočty

`computeSupplierStats(subcontracts)` — pure funkcia, beží na klientovi
nad `useSupplierSubcontracts(id)` výsledkom. Dôležité limity:

- **`on_time_rate`** je placeholder — počíta všetky `delivered` ako on-time,
  pretože zatiaľ nemáme separátnu kolónku `planovany_navrat`. Po jej pridaní
  treba upraviť funkciu v `api/supplier-crm.ts`.
- **`avg_leadtime_days`** sa počíta z `objednane_dat` → `dodane_dat` na
  delivered subdodávkach.
- **`cooperation_since`** = najstarší `created_at` zo subdodávok.

### Použitie

```tsx
import { SupplierCRMDialog, computePermissions } from "@/components/tpv/subdodavky";

function ParentTpvPage() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const permissions = computePermissions(userRoles);

  return (
    <>
      <SubdodavkyTab
        permissions={permissions}
        onOpenSupplier={setSupplierId}
      />

      {/* Mounted globally — works also when triggered from Dodávatelia tab */}
      <SupplierCRMDialog
        supplierId={supplierId}
        permissions={permissions}
        open={!!supplierId}
        onOpenChange={(o) => !o && setSupplierId(null)}
      />
    </>
  );
}
```

## 3. Excel import / export

### Závislosť

```bash
npm i xlsx
```

(SheetJS — pravdepodobne už je v `data-weave-haven` cez Lovable.)

### Export

Tlačidlo **Export** v hlavičke Subdodávky tabu okamžite stiahne aktuálny
filtrovaný zoznam ako `.xlsx` so 17 stĺpcami a auto-nastavenými šírkami.

Programaticky:

```ts
import { exportSubcontractsToXlsx } from "@/components/tpv/subdodavky";
exportSubcontractsToXlsx(subcontracts, "moj-export.xlsx");
```

### Import — dva režimy

Tlačidlo **Import** v hlavičke otvorí `<ImportDialog>` (multi-step wizard).
PM si vyberie režim:

| Režim | Použitie | Stav po importe |
|-------|----------|-----------------|
| **Bulk draft** | Konstrukter dodá Excel zoznam operácií (lakovanie 5×, sklo 4×, CNC 12×). Bez dodávateľov, bez cien. | `draft` |
| **Plný import** | Záznamy už obsahujú dodávateľov a finálne ceny. Stav po importe ide priamo do `awarded`. | `awarded` |

### Flexibilita stĺpcov

`normalizeHeader()` v `api/excel.ts` robí flexibilné mapovanie hlavičiek —
fungujú variácie ako:
- `Projekt` / `Project ID` / `Zákazka`
- `Operácia` / `Název` / `Operace`
- `Dodávateľ` / `Supplier` / `Dodávateľ názov`
- `Cena` / `Cena predpokladaná` / `Rozpočet`
- atď.

### Validácia

`validateImportRows()` rozdeľuje riadky na **valid** a **invalid**:
- *Fatal errors* (riadok sa neimportuje): chýba `project_id`, projekt
  neexistuje, chýba názov, v móde "Plný import" chýba dodávateľ.
- *Warnings* (riadok sa importuje s upozornením): TPV item code nenájdený,
  dodávateľ nenájdený v draft móde, neznáma mena.

Preview krok zobrazí oboje pred potvrdením.

### Limity

- **`potreba_do`** sa importuje do `poznamka` ako text — zatiaľ nemáme
  dedikovanú DB kolónku.
- **Vytvorenie nových dodávateľov za behu** sa nerobí — dodávateľ musí
  existovať v `tpv_supplier`. Ak v Exceli figuruje nové meno, riadok
  vyhodí varovanie / chybu.

## DB migrácia

Súbor: `supabase/migrations/20260426_tpv_audit_and_crm.sql`

Vytvára:
- `tpv_audit_log` + 5 indexov + `tpv_audit_trigger()` funkcia + 3 triggery
- `tpv_supplier_contact` (s unique partial index na `is_primary`)
- `tpv_supplier_pricelist`
- `tpv_supplier_task`
- RLS policies (read = authenticated, write = `pm`/`nakupci`/`admin`/`owner`)
- `tpv_set_updated_at()` helper trigger pre nové tabuľky

Spusti cez Supabase CLI:

```bash
supabase db push
```

alebo manuálne v Supabase SQL editor (skopíruj celý súbor).

## Update permissions

`SubcontractPermissions` má teraz ešte jedno pole:
- `canManageSupplier: boolean` — true pre `admin` / `pm` / `nakupci`,
  ovláda zobrazovanie tlačidiel **Upraviť** v CRM modaloch.

Pri upgrade existujúceho parent kódu nie je potrebná žiadna zmena —
`computePermissions()` už nové pole vyplňuje.

## Inštalačné zhrnutie

1. **DB migrácia** — spusti `supabase/migrations/20260426_tpv_audit_and_crm.sql`
2. **Závislosti** (mali by byť už v data-weave-haven):
   - `xlsx` (SheetJS) — pre Excel import/export. Ak chýba: `npm i xlsx`
   - `@tanstack/react-query`, `lucide-react`, `sonner` — už súčasť projektu
3. **Použitie v parent (Tpv.tsx)**:
   ```tsx
   import {
     SubdodavkyTab,
     SupplierCRMDialog,
     computePermissions,
   } from "@/components/tpv/subdodavky";
   ```
4. **Materiál tab** — Excel import/export sú integrované priamo v hlavičke tabu Subdodávky v rámci **Materiál tabu**. Tlačidlá *Import* a *Export* sú vedľa *Nová subdodávka*.

## Známe limitácie

- **`on_time_rate`** v `computeSupplierStats()` je momentálne placeholder — počíta všetky `delivered` ako on-time, kým sa do `tpv_subcontract` nepridá samostatný stĺpec `planovany_navrat` (rozdiel medzi *plánovaným* a *skutočným* dátumom dodania).
- **`potreba_do`** z Excel importu zatiaľ ide do `poznamka` (žiadny dedikovaný stĺpec).
- **Type A/B klasifikátor** subdodávok je heuristika v helpers.ts — pri rozšírení o `typ_spoluprace` v DB sa stane explicitným.
- **Audit triggers** bežia ako `SECURITY DEFINER` — over že vlastník funkcie má v Supabase project správne grants na `tpv_audit_log`.
- **`actor_name`** v audit logu sa zatiaľ neplní (len `actor_id` + `actor_email`). Ak chceš mená používateľov, doplň lookup v parent-side renderingu cez `auth.users` JOIN, alebo doplň trigger logiku o `users_meta` tabuľku.

---

## Phase 3 — Zarovnanie s reálnou DB schémou (apríl 2026)

Po overení reálnej Supabase schémy v `data-weave-haven` repu boli vykonané tieto zmeny:

### Zmenené stav hodnoty (DB má české labely)

`tpv_subcontract.stav` používa hodnoty: **`navrh, rfq, ponuka, objednane, dodane, zruseno`**.

`tpv_subcontract_request.stav` používa: **`sent, received, accepted, rejected`**.

`SUBCONTRACT_STAV` a `REQUEST_STAV` enumy v TypeScripte boli prepísané — kľúče (NAVRH, RFQ, …) sú stále angličtina (kvôli code štýlu), ale hodnoty zodpovedajú DB.

### `tpv_supplier_task` — rozšírená, nie znovu vytvorená

Tabuľka už existuje (z migrácie `20260424221058_…`). Naša migrácia iba `ALTER TABLE ADD COLUMN`:
- `priority` (low/normal/high/urgent, default normal)
- `done_at` (timestamptz)
- `done_by` (uuid → auth.users)

Pôvodný `status` field (`open/in_progress/done/cancelled`) ostáva — UI ho používa na rozlíšenie otvorené/uzavreté.

### `app_role` enum — pridané `nakupci`

Reálny enum obsahoval: `admin, pm, konstrukter, viewer, vedouci_pm, vedouci_konstrukter, vedouci_vyroby, mistr, quality, kalkulant`. **`owner` neexistuje** — `admin` má najvyššiu úroveň. Migrácia pridáva:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nakupci';
```

`computePermissions()` bola upravená — viac neref používa `'owner'`.

### RLS pattern — `has_role()` namiesto JOIN-u

Existujúce TPV migrácie používajú `has_role(auth.uid(), 'pm')` (SECURITY DEFINER funkcia). Naše nové RLS policies sú prepísané do toho istého patternu:

```sql
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'pm')
  OR has_role(auth.uid(),'nakupci')
  OR has_role(auth.uid(),'kalkulant')
)
```

### `tpv_items` — `item_code` + `nazev` (potvrdené z DB exportu)

Reálna `tpv_items` má 21 stĺpcov vrátane `item_code` (T01, T08, T23_b...), `nazev`, `popis`, `pocet`, `cena`, `konstrukter`, `stage_id`, `hodiny_plan` atď. (Pôvodná migrácia z 22.2.2026 ich nemala — boli pridané v neskorších migráciách.)

Excel parser hľadá prvky podľa `item_code` (`row.item_code` → `tpv_items.item_code`). Na display v UI sa zobrazuje `item_code` + `nazev` ako sekundárny popis.

### `projects` — `project_name`, nie `nazev_projektu`

Použitie v UI (PerProjectView, NewSubcontractDialog, PerSupplierView, SubcontractDetailDialog) bolo zaktualizované.

### `update_updated_at_column()` — používame existujúcu funkciu

Migrácia už nedefinuje vlastný `tpv_set_updated_at()` — použijeme globálnu funkciu, ktorú iné TPV migrácie už zavádzajú.

