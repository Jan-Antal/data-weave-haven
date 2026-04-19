
Cíl: vrátit midflight na původně správné chování tak, aby už nesahal na běžné Inbox položky destruktivně a nerozhazoval hodiny.

1. Potvrzená příčina
- Problém není samotné povolení statusu `completed`.
- Rozbití vzniklo v `src/lib/midflightImportPlanVyroby.ts`, kde se při resetu/importu:
  - spouští globální `recalculateProductionHours(...)`,
  - mažou Inbox řádky podle regexu názvu,
  - některé Inbox položky se přepínají na `status: "scheduled"`,
  - historické bundle se zapisují do `production_schedule`, kde je bere běžná logika plánování/přepočtu.

2. Co opravit v kódu
- `src/lib/midflightImportPlanVyroby.ts`
  - odstranit globální přepočet hodin z reset části,
  - odstranit mazání Inbox položek podle `item_name ~ (N/M)`,
  - nechat reset jen na skutečných midflight datech (`is_midflight`, `is_historical`, `bundle_id ::MF_`),
  - při reconciliaci už neměnit normální Inbox položky na `scheduled`,
  - historicky plně pokryté položky nechat mimo aktivní Inbox přes vlastní midflight/historical mechanismus, ne přes běžný Inbox status,
  - zachovat historické bundle jako oddělená data, aby je normální plánovací tok nebral jako klasické naplánované položky.

- `src/hooks/useProductionInbox.ts`
  - ověřit/upevnit, že Inbox počítá jen skutečné `pending` produkční položky a nebere nic “reconciled/historical”.

- `src/hooks/useProductionSchedule.ts`, `src/hooks/useProductionProgress.ts`, `src/hooks/useProductionStatuses.ts`
  - zkontrolovat filtrování, aby historical/midflight řádky nevstupovaly do běžných progress/metrik, pokud tam nemají být.

- `src/components/production/InboxPanel.tsx`
  - zablokovat destruktivní “Vrátit do TPV” pro midflight/historical položky stejně přísně jako v table view; teď je v Inboxu povolené i pro cleanup a to je riskantní.

3. Datová oprava po fixu
Protože problém už poškodil data, samotná změna kódu nestačí. Bude potřeba jednorázový recovery krok:
- obnovit běžné Inbox položky, které byly jen “reconciled” a neměly být smazané/přepnuté,
- odstranit jen skutečné midflight artefakty,
- znovu dopočítat hodiny pouze standardním bezpečným přepočtem.

To udělám jako jednorázovou opravu dat, odděleně od trvalé logiky midflight.

4. Co ponechat
- DB funkce `validate_production_schedule_status` s podporou `completed` může zůstat, sama o sobě není root cause.
- Midflight může dál vytvářet historické záznamy, ale musí být izolované od normálního Inbox/plán flow.

5. Výsledek po opravě
- Midflight bude čistit jen svoje vlastní artefakty.
- Nebude mazat ani “přemaskovávat” normální Inbox položky.
- Běžné výpočty hodin a Inbox totals se přestanou rozjíždět po resetu/importu.
- Historie zůstane viditelná, ale nebude vstupovat do normální plánovací logiky tam, kde nemá.

6. Implementační postup
- nejdřív opravit trvalou logiku v `midflightImportPlanVyroby.ts` a souvisejících guardech,
- potom připravit bezpečný jednorázový recovery pro aktuálně rozbitá data,
- nakonec ověřit na flow:
  - midflight import,
  - vyčištění midflight dat,
  - Inbox totals,
  - project detail vs Inbox,
  - návrat položek z výroby/expedice.

## Technické poznámky
- V projektové memory je explicitně uvedeno, že midflight má zapisovat historické souhrny do `production_schedule` se statusem `scheduled`, ale jako izolovaná midflight data.
- Aktuální problém vzniká tím, že kód navíc manipuluje s normálními `production_inbox` řádky (`recon_scheduled`, `recon_reduced`, delete regex), což porušuje tuto izolaci.
- Je potřeba vrátit boundary: “midflight data jsou separátní vrstva”, ne transformace standardních Inbox řádků.
