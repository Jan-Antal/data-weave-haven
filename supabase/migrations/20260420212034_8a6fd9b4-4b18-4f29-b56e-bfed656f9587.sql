
-- The FK on split_group_id -> production_schedule(id) is incompatible with
-- using split_group_id as a free chain identifier shared across schedule + inbox.
ALTER TABLE production_schedule
  DROP CONSTRAINT IF EXISTS production_schedule_split_group_id_fkey;

-- One-off backfill: project-wide chain group for projects with midflight history
DO $$
DECLARE
  proj RECORD;
  chain_id uuid;
  total_weeks int;
BEGIN
  FOR proj IN
    SELECT DISTINCT project_id
    FROM production_schedule
    WHERE is_midflight = true
  LOOP
    chain_id := gen_random_uuid();

    UPDATE production_schedule
    SET split_group_id = chain_id
    WHERE project_id = proj.project_id
      AND status != 'cancelled';

    UPDATE production_inbox
    SET split_group_id = chain_id
    WHERE project_id = proj.project_id
      AND status = 'pending';

    SELECT COUNT(DISTINCT scheduled_week) INTO total_weeks
    FROM production_schedule
    WHERE split_group_id = chain_id
      AND status != 'cancelled'
      AND scheduled_week IS NOT NULL;

    WITH ranked AS (
      SELECT id,
             DENSE_RANK() OVER (ORDER BY scheduled_week) AS rk
      FROM production_schedule
      WHERE split_group_id = chain_id
        AND status != 'cancelled'
        AND scheduled_week IS NOT NULL
    )
    UPDATE production_schedule ps
    SET split_part = ranked.rk,
        split_total = total_weeks
    FROM ranked
    WHERE ps.id = ranked.id;

    UPDATE production_inbox
    SET split_part = NULL,
        split_total = total_weeks
    WHERE split_group_id = chain_id
      AND status = 'pending';
  END LOOP;
END $$;
