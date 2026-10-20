CREATE OR REPLACE FUNCTION public.change_basic_land (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_oracle_id uuid;
  change integer;
  count_before integer;
  count_after integer;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'oracle_id', 'by']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_oracle_id := (checked ->> 'oracle_id')::uuid;
  change := (checked ->> 'by')::integer;
  if change = 0 then
    perform private.invalid_argument('by', 'by must not be 0.');
  end if;
  if not private.is_basic_land_card(chosen_oracle_id) then
    perform private.invalid_argument('oracle_id', 'oracle_id is not a basic land card.');
  end if;
  perform private.lock_deck(caller, chosen_deck_id);

  count_before := coalesce((
    select basic_land.count
    from public.deck_basic_lands basic_land
    where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = chosen_oracle_id
  ), 0);
  count_after := count_before + change;
  if count_after not between 0 and 99 then
    perform private.invalid_argument(
      'by',
      format('by would make %s of this basic land card. A deck has 0 to 99 of each basic land card.', count_after)
    );
  end if;

  change_id := private.record_deck_change(caller, chosen_deck_id, 'basic_lands');
  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    values (caller, change_id, chosen_oracle_id, count_before, count_after);
  if count_after = 0 then
    delete from public.deck_basic_lands basic_land
      where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = chosen_oracle_id;
  else
    insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
      values (caller, chosen_deck_id, chosen_oracle_id, count_after)
      on conflict (user_id, deck_id, oracle_id) do update set count = excluded.count;
  end if;
  perform private.finish_deck_change(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."change_basic_land"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."change_basic_land"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."change_basic_land"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."change_basic_land"(jsonb) FROM PUBLIC, "anon", "service_role";
