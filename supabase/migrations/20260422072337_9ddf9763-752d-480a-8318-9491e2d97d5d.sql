-- Add cancellation tracking columns to production_schedule
ALTER TABLE public.production_schedule
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- Add cancellation tracking columns to production_inbox
ALTER TABLE public.production_inbox
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- Trigger validate_production_inbox_status already permits 'cancelled' (verified in db functions)
