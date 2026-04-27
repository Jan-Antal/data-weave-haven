INSERT INTO public.role_permission_defaults (role, permissions)
SELECT 'nakupci'::app_role, permissions
FROM public.role_permission_defaults
WHERE role = 'pm'
ON CONFLICT (role) DO UPDATE
  SET permissions = EXCLUDED.permissions;

INSERT INTO public.role_permission_defaults (role, permissions)
SELECT 'finance'::app_role,
       permissions || jsonb_build_object('canSeePrices', true)
FROM public.role_permission_defaults
WHERE role = 'viewer'
ON CONFLICT (role) DO UPDATE
  SET permissions = EXCLUDED.permissions;