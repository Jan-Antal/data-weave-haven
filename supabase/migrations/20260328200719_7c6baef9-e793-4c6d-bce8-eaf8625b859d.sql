
-- 1. Create production_expedice table (source_schedule_id has ON DELETE SET NULL)
CREATE TABLE public.production_expedice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  stage_id UUID REFERENCES project_stages(id),
  item_name TEXT NOT NULL,
  item_code TEXT,
  source_schedule_id UUID REFERENCES production_schedule(id) ON DELETE SET NULL,
  manufactured_at TIMESTAMPTZ NOT NULL,
  expediced_at TIMESTAMPTZ,
  is_midflight BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.production_expedice ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "All authenticated can read production_expedice"
  ON public.production_expedice FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anonymous can read production_expedice"
  ON public.production_expedice FOR SELECT TO anon USING (true);

CREATE POLICY "Admins and PMs can manage production_expedice"
  ON public.production_expedice FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pm'::app_role));

-- 4. Migrate existing expedice/completed rows to production_expedice
INSERT INTO public.production_expedice (project_id, stage_id, item_name, item_code, source_schedule_id, manufactured_at, expediced_at, is_midflight)
SELECT
  project_id, stage_id, item_name, item_code,
  CASE WHEN COALESCE(is_midflight, false) = false THEN id ELSE NULL END,
  COALESCE(completed_at, created_at),
  expediced_at,
  COALESCE(is_midflight, false)
FROM public.production_schedule
WHERE status IN ('expedice', 'completed');

-- 5. Reset non-midflight items back to scheduled
UPDATE public.production_schedule
SET status = 'scheduled', completed_at = NULL, completed_by = NULL, expediced_at = NULL
WHERE status IN ('expedice', 'completed')
  AND COALESCE(is_midflight, false) = false;

-- 6. Delete midflight items from schedule (safe now, source_schedule_id is NULL for these)
DELETE FROM public.production_schedule
WHERE status IN ('expedice', 'completed')
  AND COALESCE(is_midflight, false) = true;

-- 7. Update trigger
CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, paused, or cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

-- 8. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_expedice;
