CREATE OR REPLACE FUNCTION private.checked_planned_swaps (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := private.checked_plan_items(
    field,
    value,
    'planned swaps',
    '{}',
    array['copy_id', 'basic_land_oracle_id', 'as_commander']
  );
  item_field text;
  incoming jsonb;
  item_index integer;
  earlier_index integer;
begin
  for item_index in 0 .. jsonb_array_length(checked) - 1 loop
    item_field := format('%s[%s]', field, item_index);
    incoming := checked -> item_index -> 'incoming';
    if (incoming ? 'copy_id') = (incoming ? 'basic_land_oracle_id') then
      perform private.invalid_argument(
        item_field || '.incoming',
        format('%s.incoming must have either copy_id or basic_land_oracle_id.', item_field)
      );
    end if;
    if incoming ? 'basic_land_oracle_id' and incoming ? 'as_commander' then
      perform private.invalid_argument(
        item_field || '.incoming.as_commander',
        format('%s.incoming.as_commander must be left out for a basic land. A basic land is never a commander.', item_field)
      );
    end if;
    if incoming ->> 'basic_land_oracle_id' = checked -> item_index -> 'outgoing' ->> 'basic_land_oracle_id' then
      perform private.invalid_argument(
        item_field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is the incoming basic land.', item_field)
      );
    end if;
  end loop;

  for item_index in 1 .. jsonb_array_length(checked) - 1 loop
    for earlier_index in 0 .. item_index - 1 loop
      if checked -> earlier_index -> 'incoming' ->> 'copy_id' = checked -> item_index -> 'incoming' ->> 'copy_id' then
        perform private.invalid_argument(
          format('%s[%s].incoming.copy_id', field, item_index),
          format(
            '%s[%s].incoming.copy_id repeats the copy of %s[%s]. A copy is held by one planned swap.',
            field,
            item_index,
            field,
            earlier_index
          )
        );
      end if;
    end loop;
  end loop;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_planned_swaps"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_planned_swaps"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_planned_swaps"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_planned_swaps"(text, jsonb) TO "postgres";
