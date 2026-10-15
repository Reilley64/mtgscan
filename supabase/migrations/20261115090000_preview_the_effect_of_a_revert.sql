create function private.reverted_deck_contents(contents jsonb, revert jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(copy order by copy ->> 'copy_id')
      from (
        select copy
        from jsonb_array_elements(contents -> 'copies') copy
        where not exists (
          select from jsonb_array_elements(revert -> 'copy_lines') line where line ->> 'copy_id' = copy ->> 'copy_id'
        )
        union all
        select jsonb_build_object('copy_id', line -> 'copy_id', 'card_printing_id', line -> 'card_printing_id', 'role', line -> 'place_after')
        from jsonb_array_elements(revert -> 'copy_lines') line
        where line ->> 'place_after' is not null
      ) reverted_copies
    ), '[]'::jsonb),
    'basic_lands', coalesce((
      select jsonb_agg(land order by land ->> 'oracle_id')
      from (
        select land
        from jsonb_array_elements(contents -> 'basic_lands') land
        where not exists (
          select from jsonb_array_elements(revert -> 'basic_land_lines') line where line ->> 'oracle_id' = land ->> 'oracle_id'
        )
        union all
        select jsonb_build_object('oracle_id', line -> 'oracle_id', 'count', line -> 'count_after')
        from jsonb_array_elements(revert -> 'basic_land_lines') line
        where (line ->> 'count_after')::integer > 0
      ) reverted_lands
    ), '[]'::jsonb)
  );
$$;

grant execute on function private.reverted_deck_contents(jsonb, jsonb) to authenticated;

create or replace function public.preview_revert(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  deck public.decks;
  evaluation public.deck_evaluations;
  revert jsonb;
  reverted jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(query, array['deck_id', 'deck_change_id']);

  select * into deck from public.decks found_deck where found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_deck_not_found();
  end if;
  perform private.reverted_revision(caller, deck.id, (checked ->> 'deck_change_id')::uuid);
  revert := private.revert_effect(caller, (checked ->> 'deck_change_id')::uuid);
  select * into evaluation from public.deck_evaluations stored where stored.user_id = caller and stored.deck_id = deck.id;
  reverted := private.reverted_deck_contents(private.deck_contents(caller, deck.id), revert);

  return jsonb_build_object(
    'revision', deck.revision,
    'lines', private.format_deck_change_lines(revert -> 'copy_lines', revert -> 'basic_land_lines'),
    'blocks', revert -> 'blocks',
    'protected_copies', revert -> 'protected_copies',
    'effect', case
      when reverted -> 'copies' <> '[]'::jsonb or reverted -> 'basic_lands' <> '[]'::jsonb
        then private.deck_change_effect(evaluation, private.judge_deck(reverted))
    end
  );
end;
$$;
