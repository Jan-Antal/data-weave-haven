ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET password_set = true
WHERE password_set IS DISTINCT FROM true;

CREATE OR REPLACE FUNCTION public.mark_password_set()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET password_set = true
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_password_set() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_password_set() TO authenticated;