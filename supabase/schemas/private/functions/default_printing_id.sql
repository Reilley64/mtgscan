CREATE OR REPLACE FUNCTION private.default_printing_id (
  card_oracle_id uuid
)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select printing.id
  from public.card_printings printing
  where printing.oracle_id = card_oracle_id
  order by
    printing.absent_since is not null,
    cardinality(printing.image_uris) > 0 desc,
    printing.lang = 'en' desc,
    'nonfoil' = any(printing.finishes) desc,
    printing.released_at desc,
    printing.set_code,
    printing.collector_number,
    printing.lang
  limit 1;
$function$;

GRANT EXECUTE ON FUNCTION "private"."default_printing_id"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."default_printing_id"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."default_printing_id"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."default_printing_id"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."default_printing_id"(uuid) TO "postgres";
