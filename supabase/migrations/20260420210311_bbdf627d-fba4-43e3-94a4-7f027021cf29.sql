UPDATE project_plan_hours
SET tpv_hours = 490,
    project_hours = 469,
    hodiny_plan = 490,
    source = 'TPV',
    recalculated_at = now()
WHERE project_id = 'Z-2607-008';