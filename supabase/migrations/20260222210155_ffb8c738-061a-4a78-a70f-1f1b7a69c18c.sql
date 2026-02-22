
-- Create people table
CREATE TABLE public.people (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PM', 'Konstruktér', 'Kalkulant')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.people FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.people FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.people FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.people FOR DELETE USING (true);

-- Seed with existing unique names and their roles
-- People who appear as PM
INSERT INTO public.people (name, role) VALUES
  ('Dominik Spisiak', 'PM'),
  ('Michal Bernatík', 'PM'),
  ('Aleš Macháček', 'PM'),
  ('Josef Heidinger', 'PM'),
  ('Michal Konečný', 'PM'),
  ('Marek Ličman', 'PM'),
  ('Adam Enenkel', 'PM'),
  ('Kateřina Fojtů', 'PM'),
  ('Martin Pešat', 'PM'),
  ('Michaela Navrátilová', 'PM'),
  ('Denisa Vylítová', 'PM'),
  ('Michal Novák', 'PM');

-- People who appear as Konstruktér
INSERT INTO public.people (name, role) VALUES
  ('Karel Mayer', 'Konstruktér'),
  ('Marek Ličman', 'Konstruktér'),
  ('Jaroslav Rehorek ext', 'Konstruktér'),
  ('Michaela Navrátilová', 'Konstruktér'),
  ('Michal Novák', 'Konstruktér'),
  ('Dominik Spisiak', 'Konstruktér'),
  ('Michal Bernatík', 'Konstruktér'),
  ('Denisa Vylítová', 'Konstruktér');

-- People who appear as Kalkulant
INSERT INTO public.people (name, role) VALUES
  ('Brick', 'Kalkulant'),
  ('Martin Pešat', 'Kalkulant'),
  ('Michal Konečný', 'Kalkulant'),
  ('Dominik Spisiak', 'Kalkulant'),
  ('Kateřina Fojtů', 'Kalkulant'),
  ('Aleš Macháček', 'Kalkulant'),
  ('Josef Heidinger', 'Kalkulant'),
  ('Adam Enenkel', 'Kalkulant');
