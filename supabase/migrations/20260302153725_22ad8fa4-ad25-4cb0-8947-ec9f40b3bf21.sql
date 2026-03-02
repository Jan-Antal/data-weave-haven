-- Drop and recreate FK with CASCADE for project_stages
ALTER TABLE public.project_stages DROP CONSTRAINT project_stages_project_id_fkey;
ALTER TABLE public.project_stages ADD CONSTRAINT project_stages_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Drop and recreate FK with CASCADE for tpv_items
ALTER TABLE public.tpv_items DROP CONSTRAINT tpv_items_project_id_fkey;
ALTER TABLE public.tpv_items ADD CONSTRAINT tpv_items_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE;