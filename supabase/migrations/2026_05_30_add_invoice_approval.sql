-- Migration: add approval metadata to invoices
BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approval_note text NULL;

CREATE INDEX IF NOT EXISTS invoices_approved_by_idx ON public.invoices (approved_by);

COMMIT;
