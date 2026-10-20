CREATE OR REPLACE FUNCTION private.copy_row (
  a            private.collection_availability,
  p            public.card_printings,
  c            public.cards,
  price        public.card_prices,
  prices_stale boolean
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'copy_id', a.copy_id,
    'printing_id', p.id,
    'name', c.name,
    'set', p.set_code,
    'collector_number', p.collector_number,
    'rarity', p.rarity,
    'image_uris', to_jsonb(p.image_uris),
    'finish', a.finish,
    'condition', a.condition,
    'language', a.language,
    'protected', a.is_protected,
    'price', private.current_price(price, a.finish, prices_stale)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."copy_row"(private.collection_availability, public.card_printings, public.cards, public.card_prices, boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."copy_row"(private.collection_availability, public.card_printings, public.cards, public.card_prices, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."copy_row"(private.collection_availability, public.card_printings, public.cards, public.card_prices, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."copy_row"(private.collection_availability, public.card_printings, public.cards, public.card_prices, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."copy_row"(private.collection_availability, public.card_printings, public.cards, public.card_prices, boolean) TO "postgres";
