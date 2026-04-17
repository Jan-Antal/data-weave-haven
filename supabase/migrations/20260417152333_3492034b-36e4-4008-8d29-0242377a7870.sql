DELETE FROM production_inbox pi
WHERE pi.status = 'scheduled'
  AND NOT EXISTS (
    SELECT 1 FROM production_schedule ps
    WHERE ps.project_id = pi.project_id
      AND ps.item_code = pi.item_code
      AND ps.status IN ('scheduled','in_progress','paused','completed')
  );