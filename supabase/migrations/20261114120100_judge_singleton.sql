create function private.judge_singleton(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with repeated as (
    select card.oracle_id, card.name, card.copy_limit, count(*)::integer as copy_count,
      case card.copy_limit when 'one' then 1 when 'number' then card.copy_limit_number end as copy_limit_count,
      jsonb_agg(deck_card.card order by deck_card.card ->> 'copy_id') as cards
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id
    where deck_card.card ->> 'kind' = 'copy'
    group by card.oracle_id
    having count(*) > 1
  ),
  over_limit as (
    select * from repeated where repeated.copy_count > repeated.copy_limit_count
  )
  select jsonb_build_object(
    'violations', case when exists (select from over_limit) then jsonb_build_array(
      private.violation(
        'singleton',
        'CR 903.5b',
        (select string_agg(format('%s copies of %s.', o.copy_count, o.name), ' ' order by o.name, o.oracle_id) from over_limit o),
        (select string_agg(format('Remove %s %s.', o.copy_count - o.copy_limit_count, o.name), ' ' order by o.name, o.oracle_id) from over_limit o)
      ) || jsonb_build_object('cards', (
        select jsonb_agg(card.value order by o.name, o.oracle_id, card.position)
        from over_limit o, jsonb_array_elements(o.cards) with ordinality as card(value, position)
      ))
    ) else '[]'::jsonb end,
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object('rule', 'singleton', 'reason', format('mtgscan cannot read the copy limit of %s.', r.name), 'cards', r.cards)
        order by r.name, r.oracle_id
      )
      from repeated r
      where r.copy_limit = 'unknown'
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
  singleton jsonb;
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
  singleton := private.judge_singleton(contents);
  violations := violations || (singleton -> 'violations');
  undetermined := undetermined || (singleton -> 'undetermined');
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
