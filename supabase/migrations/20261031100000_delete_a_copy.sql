create function private.checked_copy_id(request jsonb, other_fields text[] default '{}')
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  unknown_field text;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;
  select field into unknown_field
    from jsonb_object_keys(request) as field
    where field <> 'copy_id' and field <> all (other_fields)
    order by field
    limit 1;
  if unknown_field is not null then
    perform private.invalid_argument(unknown_field, format('%s is not a known field.', unknown_field));
  end if;
  if not request ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return private.checked_uuid('copy_id', request -> 'copy_id') #>> '{}';
end;
$$;

create function private.raise_copy_not_found()
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
$$;

create function public.delete_copy(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  chosen_copy_id uuid;
begin
  caller := private.caller_user_id();
  chosen_copy_id := private.checked_copy_id(request);

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
end;
$$;

revoke all on function public.delete_copy(jsonb) from public, anon, service_role;
grant execute on function public.delete_copy(jsonb) to authenticated;
