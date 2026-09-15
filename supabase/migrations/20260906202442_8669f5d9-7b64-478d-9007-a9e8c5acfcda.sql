create or replace function public.increment_preset_copy_count(_preset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _found boolean;
begin
  update public.community_presets
     set copy_count = coalesce(copy_count, 0) + 1
   where id = _preset_id
     and hidden = false;
  _found := found;
  return _found;
end;
$$;

revoke all on function public.increment_preset_copy_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_preset_copy_count(uuid) to service_role;