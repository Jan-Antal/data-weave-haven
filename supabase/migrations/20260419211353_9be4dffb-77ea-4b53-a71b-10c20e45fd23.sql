-- 1) Cleanup existing pending duplicates (keep most recently sent)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, item_code
           ORDER BY sent_at DESC, created_at DESC
         ) AS rn
  FROM production_inbox
  WHERE status = 'pending'
    AND item_code IS NOT NULL
)
DELETE FROM production_inbox
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Partial unique index preventing future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS production_inbox_pending_unique
  ON production_inbox (project_id, item_code)
  WHERE status = 'pending' AND item_code IS NOT NULL;