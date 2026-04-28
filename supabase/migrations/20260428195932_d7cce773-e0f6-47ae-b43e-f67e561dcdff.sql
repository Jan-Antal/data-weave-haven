-- 1) DATA FIX: vrátiť TK.01 do T17 spolu s ostatnými A-4 položkami
UPDATE public.production_schedule
SET scheduled_week = '2026-04-20'
WHERE id = '8f9e1b0f-8b5d-431e-9e86-6c6d0426a70e'
  AND scheduled_week = '2026-04-27';

-- 2) PREVENCIA: trigger ktorý drží súrodencov v rovnakej (split_group_id, split_part) v rovnakom scheduled_week
CREATE OR REPLACE FUNCTION public.sync_split_part_scheduled_week()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Iba ak sa skutočne zmenil týždeň a riadok je súčasťou split-časti
  IF NEW.split_group_id IS NULL OR NEW.split_part IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.scheduled_week IS NOT DISTINCT FROM NEW.scheduled_week THEN
    RETURN NEW;
  END IF;

  -- Guard proti rekurzii — kaskádový update sa nespustí znova
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE public.production_schedule
  SET scheduled_week = NEW.scheduled_week
  WHERE split_group_id = NEW.split_group_id
    AND split_part     = NEW.split_part
    AND id <> NEW.id
    AND scheduled_week IS DISTINCT FROM NEW.scheduled_week;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_split_part_week ON public.production_schedule;

CREATE TRIGGER trg_sync_split_part_week
AFTER UPDATE OF scheduled_week ON public.production_schedule
FOR EACH ROW
EXECUTE FUNCTION public.sync_split_part_scheduled_week();