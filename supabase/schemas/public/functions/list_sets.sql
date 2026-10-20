CREATE OR REPLACE FUNCTION public.list_sets (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  page_size integer;
  finish_view text;
  search_text text;
  after_released_at date;
  after_name text;
  after_code text;
  candidates text[];
  page text[] := '{}';
  completions jsonb := '{}';
  page_rows jsonb;
  last_shown public.card_sets;
begin
  perform private.caller_user_id();
  checked := private.check_set_list_query(query);
  page_size := (checked ->> 'limit')::integer;
  finish_view := checked ->> 'finish_view';
  search_text := lower(checked ->> 'text');
  after_released_at := (checked -> 'after' ->> 0)::date;
  after_name := checked -> 'after' ->> 1;
  after_code := checked -> 'after' ->> 2;

  loop
    select array_agg(candidate.code order by candidate.released_at desc, candidate.name, candidate.code)
    into candidates
    from (
      select card_set.code, card_set.name, card_set.released_at
      from public.card_sets card_set
      where (
          after_code is null
          or card_set.released_at < after_released_at
          or (card_set.released_at = after_released_at and (card_set.name, card_set.code) > (after_name, after_code))
        )
        and (
          search_text is null
          or strpos(lower(card_set.name), search_text) > 0
          or strpos(lower(card_set.code), search_text) > 0
        )
        and private.is_listed_set(card_set)
      order by card_set.released_at desc, card_set.name, card_set.code
      limit page_size + 1 - cardinality(page)
    ) candidate;
    exit when candidates is null;

    select
      page || coalesce(array_agg(candidate.code order by candidate.candidate_order), '{}'),
      completions || coalesce(jsonb_object_agg(candidate.code, main_set.completion), '{}')
    into page, completions
    from unnest(candidates) with ordinality as candidate(code, candidate_order)
    join (
      select printing.set_code, private.set_completion(array_agg(printing.counts)) as completion
      from private.set_card_printing_counts(candidates) printing
      where printing.in_main_set
      group by printing.set_code
    ) main_set on main_set.set_code = candidate.code
    where (main_set.completion -> finish_view ->> 'size')::integer > 0;

    select card_set.released_at, card_set.name, card_set.code
    into after_released_at, after_name, after_code
    from public.card_sets card_set
    where card_set.code = candidates[cardinality(candidates)];
    exit when cardinality(page) > page_size;
  end loop;

  select coalesce(jsonb_agg(
    private.set_row(card_set, art.set_art_uri, completions -> card_set.code)
    order by shown.shown_order
  ), '[]'::jsonb)
  into page_rows
  from unnest(page[1:page_size]) with ordinality as shown(code, shown_order)
  join public.card_sets card_set on card_set.code = shown.code
  left join private.set_art_uris(page[1:page_size]) art on art.set_code = card_set.code;

  if cardinality(page) <= page_size then
    return jsonb_build_object('items', page_rows, 'next_cursor', null);
  end if;
  select * into last_shown from public.card_sets card_set where card_set.code = page[page_size];
  return jsonb_build_object(
    'items', page_rows,
    'next_cursor', private.page_cursor(
      checked ->> 'query_hash',
      jsonb_build_array(last_shown.released_at, last_shown.name, last_shown.code)
    )
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_sets"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_sets"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_sets"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_sets"(jsonb) FROM PUBLIC, "anon", "service_role";
