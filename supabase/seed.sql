-- Seed data for development
-- Insert sample profiles (UUIDs are example — replace with actual auth user IDs)

INSERT INTO public.profiles (id, email, name, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'creator@example.com', 'Budi Santoso', 'creator'),
  ('00000000-0000-0000-0000-000000000002', 'buyer@example.com', 'Siti Rahma', 'buyer')
ON CONFLICT (id) DO NOTHING;
