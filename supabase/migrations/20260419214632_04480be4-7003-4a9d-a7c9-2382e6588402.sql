-- Revert reconciled inbox items back to pending
UPDATE production_inbox
SET status = 'pending', adhoc_reason = NULL
WHERE adhoc_reason = 'recon_scheduled';

UPDATE production_inbox
SET status = 'pending', adhoc_reason = NULL, split_group_id = NULL, split_part = NULL, split_total = NULL
WHERE adhoc_reason LIKE 'recon_reduced%';

-- Delete duplicate inbox items with split-suffix names "(N/M)"
DELETE FROM production_inbox
WHERE item_name ~ ' \([0-9]+/[0-9]+\)$';

-- Delete daily logs created by midflight (bundle_id contains "::MF_")
DELETE FROM production_daily_logs
WHERE bundle_id LIKE '%::MF_%';

-- Delete ALL midflight entries from production_schedule
DELETE FROM production_schedule WHERE is_midflight = true;

-- Delete ALL historical reconciliation entries
DELETE FROM production_schedule WHERE is_historical = true;

-- Delete ALL midflight entries from production_inbox
DELETE FROM production_inbox WHERE adhoc_reason LIKE 'midflight%';

-- Delete ALL midflight entries from production_expedice
DELETE FROM production_expedice WHERE is_midflight = true;

-- Cleanup legacy HIST_ rows
DELETE FROM production_schedule WHERE item_code LIKE 'HIST_%';