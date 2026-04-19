ALTER TABLE public.tpv_items ADD COLUMN stage_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_tpv_items_stage_id ON public.tpv_items(stage_id);