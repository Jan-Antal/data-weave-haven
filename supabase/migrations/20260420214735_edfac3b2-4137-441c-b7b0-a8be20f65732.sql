-- Restore project Z-2607-008 (Multisport) from backup_20250420
DELETE FROM production_schedule WHERE project_id='Z-2607-008';

INSERT INTO production_schedule (
  id, inbox_item_id, project_id, stage_id, item_name, scheduled_week, scheduled_hours, scheduled_czk,
  position, status, completed_at, completed_by, created_at, created_by,
  split_part, split_total, item_code, pause_reason, pause_expected_date,
  is_historical, is_midflight, tpv_expected_date, is_blocker, expediced_at,
  cancel_reason, adhoc_reason, split_group_id
)
SELECT
  id, inbox_item_id, project_id, stage_id, item_name, scheduled_week, scheduled_hours, scheduled_czk,
  position, status, completed_at, completed_by, created_at, created_by,
  split_part, split_total, item_code, pause_reason, pause_expected_date,
  is_historical, is_midflight, tpv_expected_date, is_blocker, expediced_at,
  cancel_reason, adhoc_reason, split_group_id
FROM production_schedule_backup_20250420
WHERE project_id='Z-2607-008';