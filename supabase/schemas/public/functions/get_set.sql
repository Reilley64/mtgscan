CREATE OR REPLACE FUNCTION public.get_set (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  card_set public.card_sets;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_set_query(query);
  select * into card_set
  from public.card_sets listed_set
  where listed_set.code = checked ->> 'code' and private.is_listed_set(listed_set);
  if card_set.code is null then
    perform private.raise_search_error('not_found', 'code is not a released set in the card catalog.', 'code');
  end if;

  with printing as (
    select
      counts.card_printing_id,
      counts.in_main_set,
      counts.counts,
      private.collector_number_order(p.collector_number) as collector_number_order,
      jsonb_build_object(
        'printing_id', p.id,
        'name', c.name,
        'collector_number', p.collector_number,
        'image_uri', p.image_uris[1],
        'finishes', to_jsonb(p.finishes),
        'counts', counts.counts
      ) as row,
      private.is_in_a_set_section(card_set.code, counts.card_printing_id) as in_a_set_section
    from private.set_card_printing_counts(array[card_set.code]) counts
    join public.card_printings p on p.id = counts.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
  ),
  set_section as (
    select
      section.position,
      jsonb_build_object(
        'name', section.name,
        'completion', private.set_completion(array_agg(printing.counts)),
        'card_printings', jsonb_agg(printing.row order by printing.collector_number_order)
      ) as row
    from public.set_sections section
    join public.set_section_card_printings listed
      on listed.set_code = section.set_code and listed.position = section.position
    join printing on printing.card_printing_id = listed.card_printing_id
    where section.set_code = card_set.code
    group by section.position, section.name
  )
  select
    private.set_row(
      card_set,
      (select art.set_art_uri from private.set_art_uris(array[card_set.code]) art),
      private.set_completion(array_agg(printing.counts) filter (where printing.in_main_set))
    )
    || jsonb_build_object(
      'sections', coalesce((select jsonb_agg(set_section.row order by set_section.position) from set_section), '[]'::jsonb),
      'other', jsonb_build_object(
        'completion', private.set_completion(array_agg(printing.counts) filter (where not printing.in_a_set_section)),
        'card_printings', coalesce(
          jsonb_agg(printing.row order by printing.collector_number_order)
            filter (where not printing.in_a_set_section),
          '[]'::jsonb
        )
      )
    )
  into result
  from printing;
  return result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_set"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_set"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_set"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_set"(jsonb) FROM PUBLIC, "anon", "service_role";
