-- Add terms_accepted_at to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Update handle_new_user to set terms_accepted_at when user accepts during signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, avatar_url, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data ->> 'role', ''),
    '',
    CASE WHEN NEW.raw_user_meta_data ->> 'terms_accepted' = 'true' THEN now() ELSE NULL END
  );
  RETURN NEW;
END;
$$;
