Workflow expedice odděluje výrobu od expedice pomocí dedikované tabulky `production_expedice`.
- Akce `Dokončit → Expedice` smí vytvořit záznam v `production_expedice` až po existující nebo právě potvrzené QC kontrole v `production_quality_checks`.
- Pokud QC chybí v Plánu výroby, dokončovací dialog nabídne řízenou akci `Potvrdit QC a dokončit`, která nejdřív zapíše QC a až potom odešle položku do Expedice.
- `isItemDone` logika: položka je hotová, pokud je legacy `is_midflight`, má starý status `completed`, nebo existuje záznam v `production_expedice` přes `source_schedule_id`.
- Vkládání do `production_expedice` musí předem ověřit existující `source_schedule_id`, aby nevznikaly duplicitní expedice při dokončení z Plánu výroby ani z modulu Výroba.
- Po QC/dokončení se invalidují cache `production-schedule`, `production-expedice`, `production-expedice-schedule-ids` a příslušné QC query.
- Expedice panel zobrazuje aktivní položky (`expediced_at IS NULL`), archív položky s vyplněným `expediced_at`.