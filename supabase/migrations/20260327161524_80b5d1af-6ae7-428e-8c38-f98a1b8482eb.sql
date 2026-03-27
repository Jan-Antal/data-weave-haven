CREATE OR REPLACE FUNCTION public.get_hours_by_project()
RETURNS TABLE(ami_project_id text, total_hodiny numeric, min_datum text, max_datum text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ami_project_id,
         SUM(hodiny) as total_hodiny,
         MIN(datum_sync::text) as min_datum,
         MAX(datum_sync::text) as max_datum
  FROM production_hours_log
  GROUP BY ami_project_id
$$;