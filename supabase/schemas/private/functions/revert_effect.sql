CREATE OR REPLACE FUNCTION private.revert_effect (
  owner_id  uuid,
  change_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with reverted_change as (
    select change.deck_id, change.revision
    from public.deck_changes change
    where change.user_id = owner_id and change.id = change_id
  ),
  reverted_range as (
    select change.id, change.revision
    from public.deck_changes change
    join reverted_change on reverted_change.deck_id = change.deck_id and change.revision >= reverted_change.revision
    where change.user_id = owner_id
  ),
  copy_targets as (
    select distinct on (line.copy_id) line.copy_id, line.card_printing_id, line.finish, line.place_before as place_target
    from public.deck_change_lines line
    join reverted_range change on change.id = line.deck_change_id
    where line.user_id = owner_id
    order by line.copy_id, change.revision
  ),
  copy_effects as (
    select
      target.copy_id,
      coalesce(copy.card_printing_id, target.card_printing_id) as card_printing_id,
      coalesce(copy.finish, target.finish) as finish,
      case when deck_card.deck_id = reverted_change.deck_id then private.deck_role(deck_card.commander_at) end as place_before,
      target.place_target as place_after,
      copy.id is null as deleted,
      coalesce(copy.is_protected, false) as is_protected,
      other_deck.id as other_deck_id,
      other_deck.name as other_deck_name,
      held_deck.id as held_deck_id,
      held_deck.name as held_deck_name,
      card.name
    from copy_targets target
    cross join reverted_change
    left join public.copies copy on copy.user_id = owner_id and copy.id = target.copy_id
    left join public.deck_cards deck_card on deck_card.user_id = owner_id and deck_card.copy_id = target.copy_id
    left join public.decks other_deck
      on other_deck.user_id = owner_id and other_deck.id = deck_card.deck_id and other_deck.id <> reverted_change.deck_id
    left join public.planned_swaps swap
      on swap.user_id = owner_id and swap.incoming_copy_id = copy.id and swap.status = 'open'
    left join public.decks held_deck on held_deck.user_id = owner_id and held_deck.id = swap.deck_id
    join public.card_printings printing on printing.id = coalesce(copy.card_printing_id, target.card_printing_id)
    join public.cards card on card.oracle_id = printing.oracle_id
  ),
  moved_copies as (
    select * from copy_effects effect where effect.place_before is distinct from effect.place_after
  ),
  returning_copies as (
    select * from moved_copies effect where effect.place_before is null
  ),
  land_targets as (
    select distinct on (line.oracle_id) line.oracle_id, line.count_before as count_target
    from public.deck_change_basic_lands line
    join reverted_range change on change.id = line.deck_change_id
    where line.user_id = owner_id
    order by line.oracle_id, change.revision
  ),
  land_effects as (
    select target.oracle_id, coalesce(basic_land.count, 0) as count_before, target.count_target as count_after
    from land_targets target
    cross join reverted_change
    left join public.deck_basic_lands basic_land
      on basic_land.user_id = owner_id and basic_land.deck_id = reverted_change.deck_id and basic_land.oracle_id = target.oracle_id
    where coalesce(basic_land.count, 0) <> target.count_target
  )
  select jsonb_build_object(
    'copy_lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'card_printing_id', effect.card_printing_id,
        'finish', effect.finish,
        'place_before', effect.place_before,
        'place_after', effect.place_after
      ) order by effect.name, effect.copy_id)
      from moved_copies effect
    ), '[]'::jsonb),
    'basic_land_lines', coalesce((
      select jsonb_agg(to_jsonb(effect) order by effect.oracle_id) from land_effects effect
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'name', effect.name,
        'deck', case when effect.other_deck_id is not null then
          jsonb_build_object('deck_id', effect.other_deck_id, 'name', effect.other_deck_name)
        end
      ) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.deleted or effect.other_deck_id is not null
    ), '[]'::jsonb),
    'protected_copies', coalesce((
      select jsonb_agg(jsonb_build_object('copy_id', effect.copy_id, 'name', effect.name) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.is_protected
    ), '[]'::jsonb),
    'held_copies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'name', effect.name,
        'deck', jsonb_build_object('deck_id', effect.held_deck_id, 'name', effect.held_deck_name)
      ) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.held_deck_id is not null
    ), '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."revert_effect"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."revert_effect"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."revert_effect"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."revert_effect"(uuid, uuid) TO "postgres";
