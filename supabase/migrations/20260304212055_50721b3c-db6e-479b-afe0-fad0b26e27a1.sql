
-- Add pause and cancel fields to production_schedule
ALTER TABLE public.production_schedule 
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_expected_date date,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS adhoc_reason text;

-- Add adhoc_reason to production_inbox for ad-hoc items
ALTER TABLE public.production_inbox
  ADD COLUMN IF NOT EXISTS adhoc_reason text;

-- Update the status validation trigger to allow 'paused' and 'cancelled'
CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'completed', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, completed, paused, or cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
