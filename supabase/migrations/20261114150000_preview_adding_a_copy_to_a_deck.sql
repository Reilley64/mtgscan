create or replace function private.judge_deck(contents jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  commander_count integer;
  card_count integer;
  violations jsonb := '[]';
  undetermined jsonb := '[]';
  singleton jsonb;
  color_identity jsonb;
  legality jsonb;
  eligibility jsonb;
  partner jsonb;
begin
  select count(*) filter (where copy.role = 'commander'), count(*)
    into commander_count, card_count
    from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid, role public.deck_role);
  card_count := card_count + (
    select coalesce(sum(land.count), 0)
    from jsonb_to_recordset(contents -> 'basic_lands') as land(oracle_id uuid, count integer)
  );

  if commander_count = 0 then
    violations := violations || private.violation('no_commander', 'CR 903.3', 'This deck has no commander.', null);
  end if;
  eligibility := private.judge_commander_eligibility(contents);
  violations := violations || (eligibility -> 'violations');
  undetermined := undetermined || (eligibility -> 'undetermined');
  partner := private.judge_partner(contents);
  violations := violations || (partner -> 'violations');
  undetermined := undetermined || (partner -> 'undetermined');
  if card_count <> 100 then
    violations := violations || private.violation(
      'deck_size',
      'CR 903.5a',
      format('%s of 100 cards.', card_count),
      case
        when card_count < 100 then format('Add %s.', private.card_count_label(100 - card_count))
        else format('Remove %s.', private.card_count_label(card_count - 100))
      end
    );
  end if;
  singleton := private.judge_singleton(contents);
  violations := violations || (singleton -> 'violations');
  undetermined := undetermined || (singleton -> 'undetermined');
  color_identity := private.judge_color_identity(contents);
  violations := violations || (color_identity -> 'violations');
  undetermined := undetermined || (color_identity -> 'undetermined');
  legality := private.judge_legality(contents);
  violations := violations || (legality -> 'violations');
  undetermined := undetermined || (legality -> 'undetermined');

  return jsonb_build_object(
    'validity', case
      when jsonb_array_length(violations) > 0 then 'invalid'
      when jsonb_array_length(undetermined) > 0 then 'cannot_be_determined'
      else 'valid'
    end,
    'violations', violations,
    'undetermined', undetermined,
    'chosen_color', color_identity -> 'chosen_color',
    'catalog_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'catalog')
  ) || private.judge_estimated_bracket(contents);
end;
$$;

create function private.evaluation_card_key(card jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case card ->> 'kind' when 'copy' then card ->> 'copy_id' else card ->> 'oracle_id' end;
$$;

create function private.deck_change_effect(stored public.deck_evaluations, judged jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', case when stored.validity = 'invalid' then 'adds_violation' else 'would_make_invalid' end,
    'rules', jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rule', violation ->> 'rule', 'colors', violation -> 'colors')) order by position)
  )
  from jsonb_array_elements(judged -> 'violations') with ordinality as judged_violation(violation, position)
  where stored.deck_id is not null
    and (
      not exists (
        select from jsonb_array_elements(stored.violations) stored_violation
        where stored_violation ->> 'rule' = violation ->> 'rule'
      )
      or exists (
        select from jsonb_array_elements(violation -> 'cards') card
        where private.evaluation_card_key(card) not in (
          select private.evaluation_card_key(stored_card)
          from jsonb_array_elements(stored.violations) stored_violation
          cross join jsonb_array_elements(stored_violation -> 'cards') stored_card
          where stored_violation ->> 'rule' = violation ->> 'rule'
        )
      )
    )
  having count(*) > 0;
$$;

grant execute on function
  private.judge_deck(jsonb),
  private.deck_contents(uuid, uuid),
  private.evaluation_card_key(jsonb),
  private.deck_change_effect(public.deck_evaluations, jsonb),
  private.raise_copy_not_found()
to authenticated;

create function public.preview_add_deck_card(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy public.copies;
begin
  caller := private.caller_user_id();
  checked := private.check_request(query, array['copy_id']);
  select * into chosen_copy from public.copies copy where copy.id = (checked ->> 'copy_id')::uuid;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'deck_id', deck.id,
        'effect', private.deck_change_effect(
          evaluation,
          private.judge_deck(jsonb_set(
            contents,
            '{copies}',
            contents -> 'copies' || jsonb_build_array(jsonb_build_object(
              'copy_id', chosen_copy.id,
              'card_printing_id', chosen_copy.card_printing_id,
              'role', 'main'
            ))
          ))
        )
      )
      order by deck.id
    )
    from public.decks deck
    left join public.deck_evaluations evaluation on evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    cross join lateral private.deck_contents(caller, deck.id) contents
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.preview_add_deck_card(jsonb) from public, anon, service_role;
grant execute on function public.preview_add_deck_card(jsonb) to authenticated;
