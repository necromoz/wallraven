-- Usage numbers for the site owner, at /admin/stats.
--
-- The privacy notice promises no analytics and no tracking, and this keeps that
-- promise: nothing new is collected. It only counts rows the service already
-- holds to function (accounts, sign-in sessions, synced settings, presets,
-- feedback) and returns totals, never a row about a person.
--
-- Who may call it is a table, not a hard-coded address, so the repository never
-- names anyone. Add yourself once, by hand, in the SQL editor:
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = '<your address>';
-- The table has RLS on and no policies, so nobody can read or change it through
-- the API; only the SQL editor (or the service role) can.

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_stats() RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'accounts', jsonb_build_object(
      'total', (SELECT count(*) FROM auth.users),
      'confirmed', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'new_7d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
      'new_30d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days'),
      'with_username', (SELECT count(*) FROM public.profiles)
    ),
    -- A signed-in app or browser renews its token roughly hourly while running,
    -- and each renewal is a new refresh token row. So "had a token renewed in
    -- the window" is the closest honest measure of "actually used it", for
    -- people who are signed in. People using the app without an account are
    -- invisible here by design.
    'active', jsonb_build_object(
      'users_1d', (SELECT count(DISTINCT user_id) FROM auth.refresh_tokens WHERE created_at > now() - interval '1 day'),
      'users_7d', (SELECT count(DISTINCT user_id) FROM auth.refresh_tokens WHERE created_at > now() - interval '7 days'),
      'users_30d', (SELECT count(DISTINCT user_id) FROM auth.refresh_tokens WHERE created_at > now() - interval '30 days'),
      'sessions_7d', (SELECT count(DISTINCT session_id) FROM auth.refresh_tokens WHERE created_at > now() - interval '7 days')
    ),
    'daily_active', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'users', d.users) ORDER BY d.day), '[]'::jsonb)
      FROM (
        SELECT g.day::date AS day,
               (SELECT count(DISTINCT rt.user_id) FROM auth.refresh_tokens rt
                 WHERE rt.created_at >= g.day AND rt.created_at < g.day + interval '1 day') AS users
        FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS g(day)
      ) d
    ),
    'sync', jsonb_build_object(
      'users', (SELECT count(*) FROM public.user_settings),
      'changed_7d', (SELECT count(*) FROM public.user_settings WHERE updated_at > now() - interval '7 days')
    ),
    'community', jsonb_build_object(
      'presets', (SELECT count(*) FROM public.community_presets WHERE NOT hidden),
      'likes', (SELECT count(*) FROM public.preset_likes),
      'copies', (SELECT coalesce(sum(copy_count), 0) FROM public.community_presets)
    ),
    'feedback', jsonb_build_object(
      'total_30d', (SELECT count(*) FROM public.feedback WHERE created_at > now() - interval '30 days'),
      'crashes_30d', (SELECT count(*) FROM public.feedback WHERE kind = 'crash' AND created_at > now() - interval '30 days')
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
