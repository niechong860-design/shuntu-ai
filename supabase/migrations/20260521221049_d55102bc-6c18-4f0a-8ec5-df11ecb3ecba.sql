
-- 1. Add image_url column to generation_history
ALTER TABLE public.generation_history
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS gh_user_created_idx
  ON public.generation_history (user_id, created_at DESC);

-- 2. Trigger: keep latest 100 per user + auto-delete >15 days
CREATE OR REPLACE FUNCTION public.prune_generation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 删除当前用户超过 100 张以外的旧记录
  DELETE FROM public.generation_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.generation_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 100
    );

  -- 顺带清理所有用户 15 天前的记录
  DELETE FROM public.generation_history
  WHERE created_at < now() - INTERVAL '15 days';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_generation_history ON public.generation_history;
CREATE TRIGGER trg_prune_generation_history
AFTER INSERT ON public.generation_history
FOR EACH ROW
EXECUTE FUNCTION public.prune_generation_history();

-- 3. Helper RPC: update the latest history row's image_url for current user
CREATE OR REPLACE FUNCTION public.set_latest_history_image(_model text, _image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _image_url IS NULL OR _image_url = '' THEN
    RETURN;
  END IF;

  UPDATE public.generation_history
  SET image_url = _image_url
  WHERE id = (
    SELECT id FROM public.generation_history
    WHERE user_id = v_uid
      AND model = _model
      AND image_url IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  );
END;
$$;
