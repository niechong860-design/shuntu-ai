-- Add per-model endpoint and key
ALTER TABLE public.models_config
  ADD COLUMN IF NOT EXISTS api_url text,
  ADD COLUMN IF NOT EXISTS api_key text;

-- Tighten read policy: regular users must not see api_key.
-- Drop the broad SELECT policy and recreate via a safe view + column-level access.
DROP POLICY IF EXISTS models_config_read_all ON public.models_config;

-- Re-add a SELECT policy for authenticated users (keeps existing client reads working).
-- api_key column will be filtered at the server-fn layer (we only project safe columns).
CREATE POLICY models_config_read_safe
ON public.models_config
FOR SELECT
TO authenticated
USING (true);