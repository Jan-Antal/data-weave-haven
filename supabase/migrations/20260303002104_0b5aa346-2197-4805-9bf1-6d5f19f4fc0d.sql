-- Add split tracking columns to production_schedule
ALTER TABLE public.production_schedule
  ADD COLUMN split_group_id uuid REFERENCES public.production_schedule(id) ON DELETE SET NULL,
  ADD COLUMN split_part integer,
  ADD COLUMN split_total integer;

-- Add split tracking columns to production_inbox
ALTER TABLE public.production_inbox
  ADD COLUMN split_group_id uuid,
  ADD COLUMN split_part integer,
  ADD COLUMN split_total integer;

-- Index for finding all parts of a split group
CREATE INDEX idx_production_schedule_split_group ON public.production_schedule(split_group_id) WHERE split_group_id IS NOT NULL;
CREATE INDEX idx_production_inbox_split_group ON public.production_inbox(split_group_id) WHERE split_group_id IS NOT NULL;