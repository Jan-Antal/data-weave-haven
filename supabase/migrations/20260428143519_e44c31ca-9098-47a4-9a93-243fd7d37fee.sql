CREATE OR REPLACE FUNCTION public.skip_duplicate_hours_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count integer;
BEGIN
  SELECT COUNT(*)
    INTO v_existing_count
  FROM public.production_hours_log
  WHERE datum_sync = NEW.datum_sync
    AND zamestnanec = NEW.zamestnanec
    AND ami_project_id = NEW.ami_project_id
    AND hodiny = NEW.hodiny
    AND COALESCE(cinnost_kod, '~') = COALESCE(NEW.cinnost_kod, '~')
    AND COALESCE(cinnost_nazov, '~') = COALESCE(NEW.cinnost_nazov, '~')
    AND COALESCE(source, '~') = COALESCE(NEW.source, '~')
    AND created_at < (now() - interval '60 seconds');

  IF v_existing_count > 0 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skip_duplicate_hours_import ON public.production_hours_log;

CREATE TRIGGER trg_skip_duplicate_hours_import
BEFORE INSERT ON public.production_hours_log
FOR EACH ROW
EXECUTE FUNCTION public.skip_duplicate_hours_import();