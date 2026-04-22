---
name: Inbox panel configuration
description: Inbox badge and visual behavior for new production planning items
type: feature
---
Panel Inboxu implementuje sjednocený vizuální styl (MissingItemProjectCard) s kontextovým menu. Sekce 'Aktivní' obsahuje projekty s chybějícími TPV položkami nebo nezpracovanými položkami v inboxu. Sekce 'Naplánováno' je filtrována tak, aby zobrazovala pouze projekty s alespoň jedním bundle naplánovaným v aktuálním nebo budoucím týdnu (>= currentMonday). Progress bar vizualizuje stav položek pomocí barev: sytě zelená (hotové), světle zelená (naplánované), šedá (v Inboxu) a oranžová (chybějící v TPV).

Nové položky v production_inbox se označují modrým badge 'NOVÉ'. Stav je per-user přes user_preferences.production_inbox_seen_at. Badge zůstává viditelný, dokud uživatel ručně neklikne na 'Označit jako přečtené' nebo dokud položka nezmizí z Inboxu naplánováním / změnou stavu.
