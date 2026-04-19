
## Plán: Oprava 2 problémov v Plán Výroby

### Trouble 1: Status TPV neodzrkadľuje stav v Inboxe/Pláne

**Problém**: Po zmazaní položky z inboxu/planu zostane v TPV List status "Vyroba" (alebo iný production status). Treba sync — ak položka NIE JE v inboxe ani v schedule (mimo midflight/historical), TPV status sa má vrátiť na **"Neodeslano"**.

**Riešenie**:

1. **Pridať context-menu akciu "↩ Vrátit do TPV"** v `InboxPanel.tsx` a `PlanVyrobyTableView.tsx`:
   - Zobrazí sa pri pravom kliku na položku v inboxe alebo schedule cell
   - Skrytá pre `is_midflight=true` / `is_historical=true` rows
   - Akcia: zmaže záznam z `production_inbox` / `production_schedule` + vráti `tpv_items.status` na predošlý TPV status (napr. "Schváleno") a vyčistí `sent_date`
   - Loguje cez `logActivity` + undo/redo support

2. **Auto-sync TPV status pri mazaní** — upraviť existujúce mazacie cesty:
   - `CancelItemDialog.tsx` (existing) — po delete položky z inbox/schedule skontrolovať či ešte existuje iná inbox/schedule row pre rovnaký `(project_id, item_code)`. Ak NIE → reset `tpv_items.status` na poslednú TPV hodnotu (`Schváleno`/posledný non-production status) a vyčistiť `sent_date`.
   - `useProductionDragDrop.ts` → `moveItemBackToInbox` a podobné delete cesty — rovnaký guard.
   - Pravidlo: **NEMENIŤ status pre midflight/historical items** (ich TPV status zostáva — sú legacy).

3. **Reconciliation utility** (jednorazová "Sync TPV statuses" akcia v admin toolbar):
   - Pre každú `tpv_items` row s `status IN ('Vyroba','Vyrobeno','Expedice','Hotovo')`:
     - Skontrolovať `production_inbox` (status=pending) AND `production_schedule` (NOT cancelled, NOT midflight)
     - Ak žiadny match → reset status na `Schváleno`, vyčistiť `sent_date`
   - Tlačidlo v admin sekcii PlanVyroby vedľa "Recalculate hours" / "Midflight import"
   - Toast s počtom opravených

### Trouble 2: Multisport midflight projekt — masovo zmazať bez erroru

**Problém**: Midflight import vytvoril ~všetky položky z malými hodinami pre projekt Multisport. User chce zmazať všetky inbox položky pre tento projekt. Pri mazaní spadol "velký error" — pravdepodobne tým, že CancelItemDialog spúšťa N×renumber siblings + N×activity log + nahromadenie undo entries pre desiatky split-group rows naraz.

**Riešenie**:

1. **Pridať akciu "🗑 Smazat všechny položky projektu z inboxu"** do project-level context menu v `InboxPanel.tsx`:
   - Confirm dialog s počtom položiek (napr. "Smazat 47 položek projektu Multisport z inboxu?")
   - Bulk delete v jednej DB transakcii: 
     ```ts
     await supabase.from("production_inbox").delete().eq("project_id", pid).eq("status", "pending");
     await supabase.from("production_schedule").delete().eq("project_id", pid).eq("is_midflight", true);
     ```
   - **Bez** per-item renumber/log — namiesto toho jeden súhrnný `data_log` záznam ("Bulk delete: 47 položek projektu X")
   - Auto-sync TPV statuses pre dotknuté `tpv_items` (reset na `Schváleno`)
   - Invalidate queries

2. **Lepší error handling** v `CancelItemDialog.handleCancel`:
   - Try/catch okolo `renumberSiblings` — neblokuje delete ak renumber zlyhá (best-effort)
   - Loguj konkrétnu chybu do console namiesto generického toastu

### Súbory na úpravu
- `src/components/production/CancelItemDialog.tsx` — auto-sync TPV pri delete + safer error handling
- `src/components/production/InboxPanel.tsx` — context-menu akcie "Vrátit do TPV" (item) + "Smazat všechny" (projekt)
- `src/components/production/PlanVyrobyTableView.tsx` — context-menu akcia "Vrátit do TPV" pre schedule cells
- `src/pages/PlanVyroby.tsx` — admin tlačidlo "Sync TPV statuses"
- Nový helper `src/lib/syncTpvStatuses.ts` — utility funkcia na reconciliation

### Bez zmien
- DB schéma, RLS, midflight import logika, completion/expedice flow
