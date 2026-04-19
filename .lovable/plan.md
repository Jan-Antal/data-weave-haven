

## Plán: Cleanup midflight Inboxu — Opcia A

### Čo spravím

**1. SQL migrácia (jednorazový data fix)**
- `UPDATE production_schedule SET status='completed' WHERE is_midflight=true AND status='scheduled' AND completed_at IS NOT NULL` — opraví všetky midflight bundles aby sa správne počítali ako completed (Z-2603-001 a všetky podobné)
- `DELETE FROM production_inbox WHERE adhoc_reason='recon_scheduled'` — zmaže reconciliation markery (Z-2615-002 — 6 položiek a všetky podobné)

**2. Update logiky `src/lib/midflightImportPlanVyroby.ts`** — aby sa stav nezopakoval pri ďalšom midflight importe:
- Pri vytváraní midflight `scheduleInserts` zmeniť `status: 'scheduled'` → `status: 'completed'` (riadok ~290, vetva keď bundle reprezentuje historické hodiny s `completed_at` set)
- Pri reconciliation: namiesto `inboxUpdates.push({ status: 'scheduled', adhoc_reason: 'recon_scheduled', ... })` rovno **DELETE** inbox položku (volanie `.delete().eq('id', item.id)`); čiastočne pokryté položky (`recon_reduced`) zostávajú bez zmeny — naďalej sa redukujú a ostávajú v inboxe ako remainder

### Vplyv

- **Z-2615-002** Byt Osadní → zmizne z Inboxu (6 recon_scheduled položiek zmazaných + bundles už majú `completed_at`)
- **Z-2603-001** AEC Byt Enenkel → zmizne z Inboxu (7 bundles dostanú status='completed')
- Všetky podobné midflight projekty sa správajú rovnako po nasadení
- Future midflight imports už nebudú tento stav vyrábať

### Súbory

- **Nová migrácia**: 2 SQL príkazy (UPDATE + DELETE)
- **`src/lib/midflightImportPlanVyroby.ts`**: 2 zmeny (status v scheduleInserts; delete namiesto update v reconciliation vetve `newHours < 0.05`)

### Edge cases

- Midflight bundles bez `completed_at` (ak existujú) zostanú `scheduled` — neovplyvnené
- `recon_reduced` inbox položky (čiastočne pokryté) sa NEzmažú — zostávajú ako reálny remainder na výrobu
- `useProductionProgress` netreba meniť — po oprave statusu sa bundles automaticky počítajú ako `completed`, projekt vypadne z Inboxu cez `is_complete=true`

