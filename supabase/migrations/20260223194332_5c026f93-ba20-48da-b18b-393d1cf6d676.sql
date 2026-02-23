CREATE TABLE public.column_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tab text NOT NULL,
  column_key text NOT NULL,
  custom_label text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tab, column_key)
);

ALTER TABLE public.column_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.column_labels FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.column_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.column_labels FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.column_labels FOR DELETE USING (true);