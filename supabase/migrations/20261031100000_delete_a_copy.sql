create function private.checked_delete_copy_request(request jsonb)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  field text;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;
  for field in select key from jsonb_object_keys(request) as key where key <> 'copy_id' order by key limit 1 loop
    perform private.invalid_argument(field, format('%s is not a known field.', field));
  end loop;
  if not request ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return private.checked_uuid('copy_id', request -> 'copy_id') #>> '{}';
end;
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
  chosen_copy_id := private.checked_delete_copy_request(request);

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
end;
$$;

revoke all on function public.delete_copy(jsonb) from public, anon, service_role;
grant execute on function public.delete_copy(jsonb) to authenticated;
