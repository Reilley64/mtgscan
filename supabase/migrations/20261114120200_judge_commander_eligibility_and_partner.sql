create function private.has_subtype(type_line text, subtype text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select format(' %s ', split_part(split_part(type_line, ' // ', 1), ' — ', 2)) like format('%% %s %%', subtype);
$$;

create function private.deck_commanders(contents jsonb)
returns table (
  copy_id uuid,
  name text,
  card jsonb,
  has_rules_data boolean,
  can_be_commander boolean,
  is_background boolean,
  is_time_lord_doctor boolean,
  has_partner boolean,
  partner_text text,
  partner_with_name text,
  has_choose_a_background boolean,
  has_doctors_companion boolean
)
language sql
stable
set search_path = ''
as $$
  select
    copy.copy_id,
    card.name,
    deck_card.card,
    listed.oracle_id is not null,
    listed.can_be_commander,
    private.has_subtype(listed.type_line, 'Background'),
    private.has_subtype(listed.type_line, 'Time Lord') and private.has_subtype(listed.type_line, 'Doctor'),
    listed.has_partner,
    listed.partner_text,
    listed.partner_with_name,
    listed.has_choose_a_background,
    listed.has_doctors_companion
  from private.deck_evaluation_cards(contents) deck_card
  join jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, role public.deck_role)
    on copy.copy_id = (deck_card.card ->> 'copy_id')::uuid
  join public.cards card on card.oracle_id = deck_card.oracle_id
  left join public.cards listed on listed.oracle_id = card.oracle_id and listed.absent_since is null
  where copy.role = 'commander'
  order by card.name, copy.copy_id;
$$;

create function private.judge_commander_eligibility(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with commanders as (
    select * from private.deck_commanders(contents)
  ),
  judged as (
    select
      commander.*,
      case
        when not commander.has_rules_data then 'undetermined'
        when commander.can_be_commander then 'eligible'
        when commander.is_background and exists (
          select 1
          from commanders other
          where other.copy_id <> commander.copy_id and other.has_choose_a_background is not false
        ) then 'eligible'
        else 'refused'
      end as eligibility
    from commanders commander
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_build_array(
        private.violation(
          'commander_eligibility',
          'CR 903.3',
          string_agg(format('%s cannot be your commander.', refused.name), ' ' order by refused.name, refused.copy_id),
          null
        ) || jsonb_build_object('cards', jsonb_agg(refused.card order by refused.name, refused.copy_id))
      )
      from judged refused
      where refused.eligibility = 'refused'
      having count(*) > 0
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rule', 'commander_eligibility',
          'reason', format('No rules data for %s.', unknown.name),
          'cards', jsonb_build_array(unknown.card)
        )
        order by unknown.name, unknown.copy_id
      )
      from judged unknown
      where unknown.eligibility = 'undetermined'
    ), '[]'::jsonb)
  );
$$;

create function private.judge_partner(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with commanders as (
    select * from private.deck_commanders(contents)
  ),
  pair as (
    select
      first_commander,
      second_commander,
      coalesce(
        first_commander.has_partner
          and second_commander.has_partner
          and first_commander.partner_text is not distinct from second_commander.partner_text,
        false
      )
        or coalesce(
          first_commander.partner_with_name = second_commander.name
            and second_commander.partner_with_name = first_commander.name,
          false
        )
        or coalesce(first_commander.has_choose_a_background and second_commander.is_background, false)
        or coalesce(second_commander.has_choose_a_background and first_commander.is_background, false)
        or coalesce(first_commander.has_doctors_companion and second_commander.is_time_lord_doctor, false)
        or coalesce(second_commander.has_doctors_companion and first_commander.is_time_lord_doctor, false) as is_pair
    from commanders first_commander
    join commanders second_commander
      on (first_commander.name, first_commander.copy_id) < (second_commander.name, second_commander.copy_id)
    where (select count(*) from commanders) = 2
  ),
  unreadable as (
    select
      commander.name,
      commander.copy_id,
      commander.card,
      case
        when commander.has_rules_data then format('mtgscan cannot read the partner ability of %s.', commander.name)
        else format('No rules data for %s.', commander.name)
      end as reason
    from commanders commander
    where exists (select 1 from pair where not pair.is_pair)
      and num_nulls(commander.has_partner, commander.has_choose_a_background, commander.has_doctors_companion) > 0
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_build_array(
        private.violation(
          'partner',
          'CR 702.124',
          format('%s and %s cannot be commanders together.', (pair.first_commander).name, (pair.second_commander).name),
          null
        ) || jsonb_build_object('cards', jsonb_build_array((pair.first_commander).card, (pair.second_commander).card))
      )
      from pair
      where not pair.is_pair and not exists (select 1 from unreadable)
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object('rule', 'partner', 'reason', unreadable.reason, 'cards', jsonb_build_array(unreadable.card))
        order by unreadable.name, unreadable.copy_id
      )
      from unreadable
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
