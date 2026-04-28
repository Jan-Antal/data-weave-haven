ALTER TABLE public.tpv_subcontract
  ADD CONSTRAINT tpv_subcontract_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(project_id)
  ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';