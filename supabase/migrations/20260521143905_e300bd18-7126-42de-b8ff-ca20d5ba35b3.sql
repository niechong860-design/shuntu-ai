
ALTER TABLE public.models_config
  ADD COLUMN IF NOT EXISTS request_format text NOT NULL DEFAULT 'async_id',
  ADD COLUMN IF NOT EXISTS prompt_key text NOT NULL DEFAULT 'prompt',
  ADD COLUMN IF NOT EXISTS fetch_url text;

ALTER TABLE public.models_config
  DROP CONSTRAINT IF EXISTS models_config_request_format_check;
ALTER TABLE public.models_config
  ADD CONSTRAINT models_config_request_format_check
  CHECK (request_format IN ('async_id', 'sync_url'));
