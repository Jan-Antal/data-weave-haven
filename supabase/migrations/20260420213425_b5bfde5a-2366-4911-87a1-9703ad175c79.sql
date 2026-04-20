DO $$
DECLARE
  proj RECORD;
  hodiny_plan_full numeric;
  midflight_hours numeric;
  remaining_hours numeric;
  scale_factor numeric;
  chain_id uuid;
BEGIN
  FOR proj IN
    SELECT DISTINCT project_id
    FROM production_schedule
    WHERE is_midflight = true
  LOOP
    SELECT split_group_id INTO chain_id
    FROM production_schedule
    WHERE project_id = proj.project_id AND is_midflight = true
    LIMIT 1;

    IF chain_id IS NULL THEN CONTINUE; END IF;

    SELECT hodiny_plan INTO hodiny_plan_full
    FROM project_plan_hours
    WHERE project_id = proj.project_id;

    IF hodiny_plan_full IS NULL OR hodiny_plan_full = 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(scheduled_hours), 0) INTO midflight_hours
    FROM production_schedule
    WHERE split_group_id = chain_id AND is_midflight = true;

    remaining_hours := GREATEST(0, hodiny_plan_full - midflight_hours);
    scale_factor := remaining_hours / hodiny_plan_full;

    UPDATE production_inbox
    SET estimated_hours = ROUND(estimated_hours * scale_factor, 1),
        estimated_czk = ROUND(estimated_czk * scale_factor)
    WHERE project_id = proj.project_id
      AND status = 'pending';

    UPDATE production_schedule
    SET scheduled_hours = ROUND(scheduled_hours * scale_factor, 1),
        scheduled_czk = ROUND(scheduled_czk * scale_factor)
    WHERE project_id = proj.project_id
      AND is_midflight = false
      AND status IN ('scheduled', 'in_progress');
  END LOOP;
END $$;