
-- Inspiration cases table
CREATE TABLE public.inspiration_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  model_key TEXT,
  model_name TEXT,
  aspect_ratio TEXT,
  size TEXT,
  style_id TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  views INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  favorites_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspiration_cases_created ON public.inspiration_cases (created_at DESC);
CREATE INDEX idx_inspiration_cases_user ON public.inspiration_cases (user_id);
CREATE INDEX idx_inspiration_cases_tags ON public.inspiration_cases USING GIN(tags);
CREATE INDEX idx_inspiration_cases_style ON public.inspiration_cases (style_id);

ALTER TABLE public.inspiration_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_select_published"
  ON public.inspiration_cases FOR SELECT
  TO authenticated
  USING (is_published = true OR auth.uid() = user_id OR has_admin_access(auth.uid()));

CREATE POLICY "cases_insert_own"
  ON public.inspiration_cases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cases_update_own_or_admin"
  ON public.inspiration_cases FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR has_admin_access(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR has_admin_access(auth.uid()));

CREATE POLICY "cases_delete_own_or_admin"
  ON public.inspiration_cases FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR has_admin_access(auth.uid()));

CREATE TRIGGER trg_inspiration_cases_updated
  BEFORE UPDATE ON public.inspiration_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Likes
CREATE TABLE public.case_likes (
  case_id UUID NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

ALTER TABLE public.case_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_select_all"
  ON public.case_likes FOR SELECT TO authenticated USING (true);

CREATE POLICY "likes_insert_own"
  ON public.case_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "likes_delete_own"
  ON public.case_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Favorites
CREATE TABLE public.case_favorites (
  case_id UUID NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

ALTER TABLE public.case_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favs_select_all"
  ON public.case_favorites FOR SELECT TO authenticated USING (true);

CREATE POLICY "favs_insert_own"
  ON public.case_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favs_delete_own"
  ON public.case_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Comments
CREATE TABLE public.case_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_comments_case ON public.case_comments (case_id, created_at DESC);

ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_all"
  ON public.case_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "comments_insert_own"
  ON public.case_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_delete_own_or_admin"
  ON public.case_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_admin_access(auth.uid()));

-- Maintain like/favorite counts
CREATE OR REPLACE FUNCTION public.update_case_counts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'case_likes' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.inspiration_cases SET likes_count = likes_count + 1 WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.inspiration_cases SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.case_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'case_favorites' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.inspiration_cases SET favorites_count = favorites_count + 1 WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.inspiration_cases SET favorites_count = GREATEST(0, favorites_count - 1) WHERE id = OLD.case_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_case_likes_count
  AFTER INSERT OR DELETE ON public.case_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_case_counts();

CREATE TRIGGER trg_case_favorites_count
  AFTER INSERT OR DELETE ON public.case_favorites
  FOR EACH ROW EXECUTE FUNCTION public.update_case_counts();

-- View increment RPC
CREATE OR REPLACE FUNCTION public.increment_case_view(_case_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.inspiration_cases SET views = views + 1 WHERE id = _case_id;
$$;
