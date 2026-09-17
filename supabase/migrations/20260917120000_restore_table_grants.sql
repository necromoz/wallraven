-- Restore and tighten table permissions.
--
-- Lovable's original migrations granted these explicitly, but the database
-- export they produced when the project moved to Steve's own Supabase account
-- contained no GRANT statements at all. The tables therefore arrived with
-- whatever Supabase's "automatically expose new tables" setting gave them,
-- which was full privileges for every role on every table: anonymous visitors
-- held DELETE and TRUNCATE on the pairing table, on feedback, and on everyone's
-- settings.
--
-- Nothing was ever exposed, because row level security stands in front and all
-- six tables carry policies. But relying on policies alone means one missing or
-- mistaken policy is the difference between safe and not. Grants decide whether
-- a role may touch a table at all; policies decide which rows. Both, please.
--
-- Applied by hand to the new project on 17 September 2026. Recorded here so the
-- repository remains a complete description of the schema and a rebuild does
-- not silently come up wrong.

REVOKE ALL ON public.community_presets FROM anon, authenticated;
REVOKE ALL ON public.preset_likes      FROM anon, authenticated;
REVOKE ALL ON public.profiles          FROM anon, authenticated;
REVOKE ALL ON public.user_settings     FROM anon, authenticated;
REVOKE ALL ON public.feedback          FROM anon, authenticated;
REVOKE ALL ON public.device_pairings   FROM anon, authenticated;

-- The server's own identity. Bypasses row level security by design, and is
-- never sent to a browser.
GRANT ALL ON public.community_presets  TO service_role;
GRANT ALL ON public.preset_likes       TO service_role;
GRANT ALL ON public.profiles           TO service_role;
GRANT ALL ON public.user_settings      TO service_role;
GRANT ALL ON public.feedback           TO service_role;
GRANT ALL ON public.device_pairings    TO service_role;

-- Signed-out visitors: the public gallery, and the author names shown on it.
GRANT SELECT ON public.community_presets TO anon;
GRANT SELECT ON public.profiles          TO anon;

-- Signed-in users, acting on their own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_presets TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.preset_likes      TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.profiles          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings     TO authenticated;

-- feedback and device_pairings are deliberately absent from the two rows above.
-- Both are written only by the website's own server endpoints, and
-- device_pairings holds live session tokens while a pairing is outstanding.

REVOKE ALL ON FUNCTION public.increment_preset_copy_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_preset_copy_count(uuid) TO service_role;
