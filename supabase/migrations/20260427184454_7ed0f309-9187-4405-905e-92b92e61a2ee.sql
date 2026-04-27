UPDATE public.role_permission_defaults
SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{canManageTPV}', 'true'::jsonb)
WHERE role = 'admin';

UPDATE public.user_roles
SET permissions = permissions - 'canManageTPV'
WHERE role = 'admin' AND permissions ? 'canManageTPV';