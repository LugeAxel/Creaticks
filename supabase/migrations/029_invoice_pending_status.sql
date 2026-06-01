-- Allow invoices to have 'pending' status for payment proof awaiting review
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_status_check,
ADD CONSTRAINT invoices_status_check 
  CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled'));
