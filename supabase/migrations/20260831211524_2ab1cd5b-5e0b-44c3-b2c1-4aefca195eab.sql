DROP FUNCTION IF EXISTS public.bump_preset_copy_count(uuid);

REVOKE ALL ON FUNCTION public.sync_preset_like_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_community_presets_updated_at() FROM PUBLIC, anon, authenticated;