CREATE OR REPLACE FUNCTION private.commander_count_under_limit (
  owner_id       uuid,
  chosen_deck_id uuid,
  field          text
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  commander_count integer;
begin
  select count(*) into commander_count
    from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.commander_at is not null;
  if commander_count >= 2 then
    perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', field);
  end if;
  return commander_count;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."commander_count_under_limit"(uuid, uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."commander_count_under_limit"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."commander_count_under_limit"(uuid, uuid, text) TO "postgres";
