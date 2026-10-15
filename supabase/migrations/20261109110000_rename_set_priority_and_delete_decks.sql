create or replace function private.check_request(request jsonb, fields text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  field text;
  value jsonb;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(request) as entry order by entry.key loop
    if not field = any(fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, case field
      when 'name' then private.checked_name(value)
      when 'tagged' then private.checked_boolean(field, value)
      when 'priority' then private.checked_choice(field, value, enum_range(null::public.deck_priority)::text[])
      else private.checked_uuid(field, value)
    end);
  end loop;

  foreach field in array fields loop
    if not checked ? field then
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
$$;

create function public.rename_deck(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['deck_id', 'name']);

  update public.decks deck
    set name = checked ->> 'name', last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create function public.set_deck_priority(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['deck_id', 'priority']);

  update public.decks deck
    set priority = (checked ->> 'priority')::public.deck_priority, last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create function public.delete_deck(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['deck_id']);

  delete from public.decks deck
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

revoke all on function
  public.rename_deck(jsonb),
  public.set_deck_priority(jsonb),
  public.delete_deck(jsonb)
from public, anon, service_role;
grant execute on function
  public.rename_deck(jsonb),
  public.set_deck_priority(jsonb),
  public.delete_deck(jsonb)
to authenticated;
