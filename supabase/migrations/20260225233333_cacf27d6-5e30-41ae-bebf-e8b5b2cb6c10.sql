
-- Custom column definitions table
CREATE TABLE public.custom_column_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL CHECK (table_name IN ('projects', 'tpv_items')),
  group_key text NOT NULL,
  column_key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL DEFAULT 'text' CHECK (data_type IN ('text', 'date', 'number', 'select', 'people')),
  select_options text[] DEFAULT '{}',
  people_role text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (table_name, column_key)
);

ALTER TABLE public.custom_column_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom_column_definitions"
  ON public.custom_column_definitions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert custom_column_definitions"
  ON public.custom_column_definitions FOR INSERT
  TO authenticated WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can update custom_column_definitions"
  ON public.custom_column_definitions FOR UPDATE
  TO authenticated USING (
    has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete custom_column_definitions"
  ON public.custom_column_definitions FOR DELETE
  TO authenticated USING (
    has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Add custom_fields JSONB column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}';

-- Add custom_fields JSONB column to tpv_items
ALTER TABLE public.tpv_items ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}';
