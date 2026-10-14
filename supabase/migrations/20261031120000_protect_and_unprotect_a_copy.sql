create function public.set_copy_protected(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  chosen_copy_id uuid;
  protecting boolean;
  copy_is_free boolean;
begin
  caller := private.caller_user_id();
  chosen_copy_id := private.checked_copy_id(request, array['protected']);
  if not request ? 'protected' then
    perform private.invalid_argument('protected', 'protected is required.');
  end if;
  protecting := private.checked_boolean('protected', request -> 'protected')::boolean;

  perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id for update;
  if not found then
    perform private.raise_copy_not_found();
  end if;

  if protecting then
    select a.is_free into copy_is_free
      from private.collection_availability a
      where a.user_id = caller and a.copy_id = chosen_copy_id;
    if copy_is_free is not true then
      perform private.raise_search_error('copy_not_free', 'Only a free copy can be protected.', 'copy_id');
    end if;
  end if;

  update public.copies copy
    set is_protected = protecting
    where copy.user_id = caller and copy.id = chosen_copy_id;

  return jsonb_build_object('copy_id', chosen_copy_id, 'protected', protecting);
end;
$$;

revoke all on function public.set_copy_protected(jsonb) from public, anon, service_role;
grant execute on function public.set_copy_protected(jsonb) to authenticated;
