-- Add plan columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'basic'; -- 'basic' or 'pro'

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON public.profiles(plan_type);

-- Function to check plan limits (optional, can be done in app logic)
