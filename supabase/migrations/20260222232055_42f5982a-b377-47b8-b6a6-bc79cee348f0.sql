
-- Add deleted_at column to projects
ALTER TABLE public.projects ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to project_stages
ALTER TABLE public.project_stages ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to tpv_items
ALTER TABLE public.tpv_items ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient filtering
CREATE INDEX idx_projects_deleted_at ON public.projects (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_stages_deleted_at ON public.project_stages (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tpv_items_deleted_at ON public.tpv_items (deleted_at) WHERE deleted_at IS NULL;

-- Create auto-purge function
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_records()
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM tpv_items WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
  DELETE FROM project_stages WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
END;
$$;
