
CREATE TABLE public.sharepoint_document_cache (
  project_id text PRIMARY KEY,
  category_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_list jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sharepoint_document_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sharepoint_document_cache"
  ON public.sharepoint_document_cache FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert sharepoint_document_cache"
  ON public.sharepoint_document_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sharepoint_document_cache"
  ON public.sharepoint_document_cache FOR UPDATE
  USING (true);
