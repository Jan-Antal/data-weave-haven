
ALTER TABLE public.production_schedule
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid;

ALTER TABLE public.production_inbox
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid;

CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'paused', 'cancelled', 'completed', 'returned') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, paused, cancelled, completed, or returned', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_production_inbox_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending', 'scheduled', 'cancelled', 'returned') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending, scheduled, cancelled, or returned', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
