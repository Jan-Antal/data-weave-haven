
-- Add konstrukter column to tpv_items
ALTER TABLE public.tpv_items ADD COLUMN konstrukter text;

-- Create TPV status options table
CREATE TABLE public.tpv_status_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tpv_status_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.tpv_status_options FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.tpv_status_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.tpv_status_options FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.tpv_status_options FOR DELETE USING (true);

-- Seed default statuses
INSERT INTO public.tpv_status_options (label, sort_order) VALUES
  ('V přípravě', 1),
  ('Odesláno klientovi', 2),
  ('1. připomínky', 3),
  ('2. kolo', 4),
  ('Přijato', 5);
