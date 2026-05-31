-- Add proof_image_url column to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS proof_image_url TEXT DEFAULT '';
