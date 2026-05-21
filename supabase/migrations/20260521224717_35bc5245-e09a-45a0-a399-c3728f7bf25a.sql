ALTER TABLE public.models_config
ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;