CREATE OR REPLACE FUNCTION private.is_basic_land_card (
  card_oracle_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (select 1 from private.basic_land_cards() land where land.oracle_id = card_oracle_id);
$function$;

GRANT EXECUTE ON FUNCTION "private"."is_basic_land_card"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."is_basic_land_card"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_basic_land_card"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_basic_land_card"(uuid) TO "postgres";
