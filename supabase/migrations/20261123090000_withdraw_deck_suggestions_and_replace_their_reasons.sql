create function private.locked_deck_suggestion(
  owner_id uuid,
  chosen_suggestion_id uuid,
  changeable_statuses public.deck_suggestion_status[]
)
returns public.deck_suggestions
language plpgsql
set search_path = ''
as $$
declare
  suggestion public.deck_suggestions;
begin
  select * into suggestion
    from public.deck_suggestions found_suggestion
    where found_suggestion.user_id = owner_id and found_suggestion.id = chosen_suggestion_id
    for update;
  if suggestion.id is null then
    perform private.raise_search_error('not_found', 'suggestion_id is not one of your deck suggestions.', 'suggestion_id');
  end if;
  if not suggestion.status = any(changeable_statuses) then
    perform private.raise_search_error(
      'not_open',
      format('The deck suggestion is %s. Only an open deck suggestion can change.', suggestion.status),
      'suggestion_id'
    );
  end if;
  return suggestion;
end;
$$;

create function private.record_deck_suggestion_event(
  owner_id uuid,
  chosen_suggestion_id uuid,
  event_kind public.deck_suggestion_event_kind,
  changed boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if changed then
    insert into public.deck_suggestion_events (user_id, suggestion_id, kind, client_id, client_name)
      select owner_id, chosen_suggestion_id, event_kind, client.client_id, client.client_name
      from private.caller_ai_client() client;
  end if;
  return jsonb_build_object('suggestion_id', chosen_suggestion_id, 'changed', changed);
end;
$$;

create function public.withdraw_deck_suggestion(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  suggestion public.deck_suggestions;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['suggestion_id']);
  suggestion := private.locked_deck_suggestion(caller, (checked ->> 'suggestion_id')::uuid, array['open', 'withdrawn']::public.deck_suggestion_status[]);
  changed := suggestion.status = 'open';

  if changed then
    update public.deck_suggestions saved
      set status = 'withdrawn', status_changed_at = now()
      where saved.user_id = caller and saved.id = suggestion.id;
  end if;
  return private.record_deck_suggestion_event(caller, suggestion.id, 'withdrawn', changed);
end;
$$;

create function public.update_deck_suggestion_reason(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  suggestion public.deck_suggestions;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['suggestion_id', 'reason']);
  suggestion := private.locked_deck_suggestion(caller, (checked ->> 'suggestion_id')::uuid, array['open']::public.deck_suggestion_status[]);
  changed := suggestion.reason <> checked ->> 'reason';

  if changed then
    update public.deck_suggestions saved
      set reason = checked ->> 'reason'
      where saved.user_id = caller and saved.id = suggestion.id;
  end if;
  return private.record_deck_suggestion_event(caller, suggestion.id, 'reason_replaced', changed);
end;
$$;

revoke all on function
  public.withdraw_deck_suggestion(jsonb),
  public.update_deck_suggestion_reason(jsonb)
from public, anon, service_role;
grant execute on function
  public.withdraw_deck_suggestion(jsonb),
  public.update_deck_suggestion_reason(jsonb)
to authenticated;
