-- Reset stale permission overrides for ALL roles.
-- Any user_roles row whose JSONB overrides are missing the new key 'canAccessTpv'
-- is treated as a stale snapshot from before TPV/PlanVyroby flags existed.
-- Setting permissions = NULL makes has_permission() fall through to the
-- role_permission_defaults preset (which already contains all current flags).
UPDATE public.user_roles
SET permissions = NULL
WHERE permissions IS NOT NULL
  AND NOT (permissions ? 'canAccessTpv');