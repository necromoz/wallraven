CREATE TABLE public.community_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Anonymous',
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Other',
  tags text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  like_count integer NOT NULL DEFAULT 0,
  copy_count integer NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX community_presets_category_idx ON public.community_presets (category);
CREATE INDEX community_presets_created_idx ON public.community_presets (created_at DESC);
CREATE INDEX community_presets_likes_idx ON public.community_presets (like_count DESC);

GRANT SELECT ON public.community_presets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_presets TO authenticated;
GRANT ALL ON public.community_presets TO service_role;

ALTER TABLE public.community_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible presets"
  ON public.community_presets FOR SELECT TO anon, authenticated
  USING (hidden = false);

CREATE POLICY "Authors can view their own presets"
  ON public.community_presets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can publish their own presets"
  ON public.community_presets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authors can update their own presets"
  ON public.community_presets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authors can delete their own presets"
  ON public.community_presets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.preset_likes (
  preset_id uuid NOT NULL REFERENCES public.community_presets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.preset_likes TO authenticated;
GRANT ALL ON public.preset_likes TO service_role;

ALTER TABLE public.preset_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own likes"
  ON public.preset_likes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can like presets"
  ON public.preset_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own likes"
  ON public.preset_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_preset_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_presets SET like_count = like_count + 1 WHERE id = NEW.preset_id;
    RETURN NEW;
  ELSE
    UPDATE public.community_presets SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.preset_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER preset_likes_count_ins AFTER INSERT ON public.preset_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_preset_like_count();
CREATE TRIGGER preset_likes_count_del AFTER DELETE ON public.preset_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_preset_like_count();

CREATE OR REPLACE FUNCTION public.touch_community_presets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_presets_touch BEFORE UPDATE ON public.community_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_community_presets_updated_at();

CREATE OR REPLACE FUNCTION public.bump_preset_copy_count(_preset_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_presets
  SET copy_count = copy_count + 1
  WHERE id = _preset_id AND hidden = false;
$$;

GRANT EXECUTE ON FUNCTION public.bump_preset_copy_count(uuid) TO anon, authenticated;