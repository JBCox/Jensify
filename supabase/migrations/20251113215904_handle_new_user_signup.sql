-- Migration: Handle new user signup
-- Description: Automatically create user profile in public.users when a new user signs up
-- This trigger runs with elevated privileges to bypass RLS policies

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER  -- Run with elevated privileges to bypass RLS
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert new user profile into public.users table
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    'employee'  -- Default role
  );

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- User already exists, ignore the error
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Error creating user profile for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.users TO postgres, service_role;

COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a user profile in public.users when a new user signs up via auth.users';
