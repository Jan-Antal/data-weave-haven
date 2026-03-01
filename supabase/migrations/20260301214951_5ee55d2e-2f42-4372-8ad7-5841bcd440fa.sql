
ALTER TABLE public.tpv_items 
ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS import_source text DEFAULT NULL;
