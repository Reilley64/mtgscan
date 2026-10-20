CREATE OR REPLACE FUNCTION private.text_search (
  checked jsonb,
  OUT     condition text,
  OUT     tier text,
  OUT     text_rank text
)
  RETURNS record
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  text_key text;
  text_query text;
  name_match text;
  tag_match text;
begin
  tier := '0';
  text_rank := '0';
  if not checked ? 'text' then
    return;
  end if;
  text_key := private.name_key(checked ->> 'text');
  text_query := plainto_tsquery('english', checked ->> 'text')::text;
  name_match := format(
    'case when c.name_key = %1$L then 0 '
    'when %1$L = any (string_to_array(c.name_key, ''/'')) then 1 '
    'when c.name_key like %2$L then 2 ',
    text_key,
    '%' || text_key || '%'
  );
  if numnode(text_query::tsquery) > 0 then
    tag_match := private.tagged_cards_condition(format(
      'select t.id from public.oracle_tags t where t.search_vector @@ %1$L::tsquery '
      'or %2$L = any (t.label_keys) or %2$L = any (t.alias_keys)',
      text_query,
      text_key
    ));
    condition := format(
      '(c.name_key like %L or c.search_vector @@ %L::tsquery or %s)',
      '%' || text_key || '%',
      text_query,
      tag_match
    );
    text_rank := format('-ts_rank(c.search_vector, %L::tsquery)::numeric', text_query);
    tier := name_match || format(
      'when ts_filter(c.search_vector, ''{a}'') @@ %1$L::tsquery then 2 '
      'when %2$s then 3 '
      'when ts_filter(c.search_vector, ''{c}'') @@ %1$L::tsquery then 4 else 5 end',
      text_query,
      tag_match
    );
  else
    condition := format('c.name_key like %L', '%' || text_key || '%');
    tier := name_match || 'end';
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."text_search"(jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."text_search"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."text_search"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."text_search"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."text_search"(jsonb) TO "postgres";
