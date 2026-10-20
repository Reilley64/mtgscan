CREATE OR REPLACE FUNCTION public.list_card_printings (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  data_as_of jsonb;
  checked jsonb;
  card_oracle_id uuid;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_released_at date;
  after_set_code text;
  after_collector_number text;
  after_id uuid;
  page_rows public.card_printings[];
  last_row public.card_printings;
  items jsonb;
  next_cursor text;
begin
  data_as_of := private.rules_freshness();
  checked := private.check_card_printings_query(query);
  card_oracle_id := (checked ->> 'oracle_id')::uuid;
  if not exists (select 1 from public.cards c where c.oracle_id = card_oracle_id) then
    perform private.raise_search_error('not_found', 'oracle_id is not a card in the card catalog.', 'oracle_id');
  end if;

  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('card printings ' || (checked - array['cursor', 'limit'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 4);
    begin
      after_released_at := (after_key ->> 0)::date;
      after_set_code := after_key ->> 1;
      after_collector_number := after_key ->> 2;
      after_id := (after_key ->> 3)::uuid;
    exception when others then
      after_id := null;
    end;
    if num_nulls(after_released_at, after_set_code, after_collector_number, after_id) > 0 then
      perform private.raise_search_error(
        'invalid_cursor',
        'The cursor is not valid. Start again without a cursor.',
        'cursor'
      );
    end if;
  end if;

  page_rows := array(
    select p
    from public.card_printings p
    where p.oracle_id = card_oracle_id
      and (p.absent_since is null or private.owned_printing_quantity(p.id) > 0)
      and (not (checked ->> 'owned_only')::boolean or private.owned_printing_quantity(p.id) > 0)
      and (
        after_key is null
        or p.released_at < after_released_at
        or (
          p.released_at = after_released_at
          and (p.set_code, p.collector_number, p.id) > (after_set_code, after_collector_number, after_id)
        )
      )
    order by p.released_at desc, p.set_code, p.collector_number, p.id
    limit page_size + 1
  );

  if cardinality(page_rows) > page_size then
    last_row := page_rows[page_size];
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(last_row.released_at, last_row.set_code, last_row.collector_number, last_row.id)
    );
  end if;

  select coalesce(jsonb_agg(
    private.card_printing_fields(page_rows[i])
      || jsonb_build_object(
        'image_uris', to_jsonb(page_rows[i].image_uris),
        'owned_quantity', private.owned_printing_quantity(page_rows[i].id)
      )
    order by i
  ), '[]'::jsonb)
  into items
  from generate_series(1, least(cardinality(page_rows), page_size)) as i;

  return jsonb_build_object('items', items, 'next_cursor', next_cursor) || data_as_of;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_card_printings"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_card_printings"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_card_printings"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_card_printings"(jsonb) FROM PUBLIC, "anon", "service_role";
