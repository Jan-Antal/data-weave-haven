
-- Add manually_edited_fields to project_stages
ALTER TABLE public.project_stages ADD COLUMN IF NOT EXISTS manually_edited_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate existing stages: mark all editable inherited fields as manually edited
-- so existing data displays in normal dark font
UPDATE public.project_stages
SET manually_edited_fields = '["kalkulant","pm","status","start_date","datum_smluvni","tpv_date","expedice","montaz","predani","architekt","konstrukter","risk","zamereni","narocnost"]'::jsonb
WHERE manually_edited_fields = '[]'::jsonb;
