create function private.deck_evaluation_cards(contents jsonb)
returns table (card jsonb, oracle_id uuid)
language sql
stable
set search_path = ''
as $$
  select
    jsonb_build_object('kind', 'copy', 'copy_id', copy.copy_id, 'name', card.name, 'image_uris', to_jsonb(printing.image_uris)),
    card.oracle_id
  from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid)
  join public.card_printings printing on printing.id = copy.card_printing_id
  join public.cards card on card.oracle_id = printing.oracle_id
  union all
  select
    jsonb_build_object(
      'kind', 'basic_land',
      'oracle_id', card.oracle_id,
      'name', card.name,
      'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
    ),
    card.oracle_id
  from jsonb_to_recordset(contents -> 'basic_lands') as basic_land(oracle_id uuid)
  join public.cards card on card.oracle_id = basic_land.oracle_id
  left join private.basic_land_cards() land on land.oracle_id = card.oracle_id;
$$;

create function private.judge_legality(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with judged as (
    select
      deck_card.card,
      card.name,
      case
        when card.absent_since is not null or card.commander_legality = 'unknown' then 'undetermined'
        else card.commander_legality::text
      end as outcome
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id
  ),
  sentences as (
    select
      judged.*,
      format(
        case judged.outcome
          when 'banned' then '%s is banned in Commander.'
          when 'not_legal' then '%s is not legal in Commander.'
          else 'No rules data for %s.'
        end,
        judged.name
      ) as sentence
    from judged
    where judged.outcome <> 'legal'
  ),
  outcomes as (
    select
      sentences.outcome,
      string_agg(distinct sentences.sentence, ' ' order by sentences.sentence) as message,
      jsonb_agg(sentences.card order by sentences.name, sentences.card ->> 'copy_id') as cards
    from sentences
    group by sentences.outcome
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_agg(
        private.violation(outcomes.outcome, null, outcomes.message, null) || jsonb_build_object('cards', outcomes.cards)
        order by outcomes.outcome = 'not_legal'
      )
      from outcomes
      where outcomes.outcome in ('banned', 'not_legal')
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(jsonb_build_object('rule', 'legality', 'reason', outcomes.message, 'cards', outcomes.cards))
      from outcomes
      where outcomes.outcome = 'undetermined'
    ), '[]'::jsonb)
  );
$$;

create or replace function private.judge_deck(contents jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  commander_count integer;
  card_count integer;
  violations jsonb := '[]';
  undetermined jsonb := '[]';
  legality jsonb;
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
    'catalog_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'catalog')
  );
end;
$$;

select private.save_deck_evaluation(deck.user_id, deck.id) from public.decks deck;
