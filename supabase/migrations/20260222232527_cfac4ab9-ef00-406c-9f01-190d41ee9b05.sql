
-- Create project_status_options table
CREATE TABLE public.project_status_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_status_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.project_status_options FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.project_status_options FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.project_status_options FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.project_status_options FOR DELETE USING (true);

-- Add color column to tpv_status_options
ALTER TABLE public.tpv_status_options ADD COLUMN color TEXT NOT NULL DEFAULT '#6b7280';

-- Seed project statuses with appropriate colors
INSERT INTO public.project_status_options (label, color, sort_order) VALUES
  ('Příprava', '#6b7280', 0),
  ('Engineering', '#3b82f6', 1),
  ('TPV', '#f59e0b', 2),
  ('Výroba IN', '#8b5cf6', 3),
  ('Expedice', '#06b6d4', 4),
  ('Montáž', '#1d1d1f', 5),
  ('Fakturace', '#22c55e', 6),
  ('Dokončeno', '#16a34a', 7),
  ('Reklamace', '#ef4444', 8);
