CREATE OR REPLACE FUNCTION public.get_copy (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_copy_query(query);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(line.purchase_day_usd_cents, a.finish),
    'type_line', c.type_line,
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ), '[]'::jsonb),
    'commander_legality', c.commander_legality,
    'art_crop_uri', p.art_crop_uri,
    'user_tags', coalesce((
      select jsonb_agg(jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name) order by lower(user_tag.name), user_tag.name, user_tag.id)
      from public.copy_user_tags link
      join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id
      where link.user_id = a.user_id and link.copy_id = a.copy_id and link.deleted_at is null and user_tag.deleted_at is null
    ), '[]'::jsonb),
    'deck', (
      select jsonb_build_object(
        'deck_id', deck.id,
        'name', deck.name,
        'role', private.deck_role(deck_card.commander_at),
        'commander_art_crop_uri', deck_commanders.commanders -> 0 -> 'art_crop_uri',
        'commander_count', jsonb_array_length(deck_commanders.commanders)
      )
      from public.deck_cards deck_card
      join public.decks deck on deck.user_id = deck_card.user_id and deck.id = deck_card.deck_id
      cross join lateral (select private.deck_row(deck) -> 'commanders' as commanders) deck_commanders
      where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id
    ),
    'held_for', (
      select jsonb_build_object(
        'deck_id', deck.id,
        'name', deck.name,
        'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri'
      )
      from public.planned_swaps swap
      join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
      where swap.user_id = a.user_id and swap.incoming_copy_id = a.copy_id and swap.status = 'open'
    )
  )
  into result
  from private.collection_availability a
  join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id
  join public.collection_additions addition on addition.id = copy.addition_id
  join public.collection_addition_lines line
    on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
      = (copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
  join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = p.oracle_id
  left join public.card_prices price on price.printing_id = p.id
  where a.copy_id = (checked ->> 'copy_id')::uuid;

  if result is null then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  return result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_copy"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_copy"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_copy"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_copy"(jsonb) FROM PUBLIC, "anon", "service_role";
