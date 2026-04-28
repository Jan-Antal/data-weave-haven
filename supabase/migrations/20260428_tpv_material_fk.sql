-- Phase 2 — TPV Material FK constraints
--
-- Same issue as tpv_subcontract: PostgREST embedded joins with explicit
-- FK names require constraints with those exact names in DB.
--
-- Code uses (in src/components/tpv/material/api/index.ts):
--   tpv_item: tpv_items(...)              — Supabase auto-resolves
--   project:  projects(...)               — Supabase auto-resolves
--
-- We use the *implicit* form (no !constraint_name) so any FK with the
-- right column targeting the right table works. But if the FKs don't
-- exist at all, even implicit lookup fails.
--
-- Verify which constraints exist before applying. If both already
-- exist (under any name), this migration is a no-op safety net.

DO $$
BEGIN
  -- tpv_material.project_id → projects.project_id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'tpv_material'
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = ANY(c.conkey)
          AND a.attname = 'project_id'
      )
  ) THEN
    ALTER TABLE public.tpv_material
      ADD CONSTRAINT tpv_material_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id)
      ON DELETE CASCADE;
  END IF;

  -- tpv_material.tpv_item_id → tpv_items.id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'tpv_material'
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = ANY(c.conkey)
          AND a.attname = 'tpv_item_id'
      )
  ) THEN
    ALTER TABLE public.tpv_material
      ADD CONSTRAINT tpv_material_tpv_item_id_fkey
      FOREIGN KEY (tpv_item_id) REFERENCES public.tpv_items(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
