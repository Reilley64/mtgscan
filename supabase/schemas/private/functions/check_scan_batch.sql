CREATE OR REPLACE FUNCTION private.check_scan_batch (
  batch jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  key text;
  value jsonb;
  items jsonb;
  repeated_field text;
begin
  if jsonb_typeof(batch) is distinct from 'object' then
    perform private.invalid_argument(null, 'The batch must be a JSON object.');
  end if;

  for key, value in select entry.key, entry.value from jsonb_each(batch) as entry order by entry.key loop
    if key = 'items' then
      if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 2000 then
        perform private.invalid_argument(key, 'items must be a list of 1 to 2000 stacks.');
      end if;
      items := (
        select jsonb_agg(
          private.checked_scan_batch_item(format('items[%s]', e.ordinality - 1), e.element)
          order by e.ordinality
        )
        from jsonb_array_elements(value) with ordinality as e(element, ordinality)
      );
    else
      perform private.invalid_argument(key, format('%s is not a known field.', key));
    end if;
  end loop;

  if items is null then
    perform private.invalid_argument('items', 'items is required.');
  end if;

  if (select sum(jsonb_array_length(item -> 'copy_ids')) from jsonb_array_elements(items) as item) > 10000 then
    perform private.invalid_argument('items', 'A scan batch holds at most 10000 copy IDs.');
  end if;

  select format('items[%s].copy_ids[%s]', copy.item_index, copy.copy_index)
    into repeated_field
    from (
      select
        i.ordinality - 1 as item_index,
        c.ordinality - 1 as copy_index,
        row_number() over (partition by c.copy_id order by i.ordinality, c.ordinality) as occurrence
      from jsonb_array_elements(items) with ordinality as i(item, ordinality)
      cross join jsonb_array_elements_text(i.item -> 'copy_ids') with ordinality as c(copy_id, ordinality)
    ) copy
    where copy.occurrence > 1
    order by copy.item_index, copy.copy_index
    limit 1;
  if repeated_field is not null then
    perform private.invalid_argument(repeated_field, format('%s repeats another copy ID in the batch.', repeated_field));
  end if;

  return (
    select jsonb_agg(
      jsonb_build_object(
        'copy_id', c.copy_id,
        'card_printing_id', i.item -> 'card_printing_id',
        'finish', i.item -> 'finish',
        'condition', i.item -> 'condition',
        'language', i.item -> 'language'
      )
      order by i.ordinality, c.ordinality
    )
    from jsonb_array_elements(items) with ordinality as i(item, ordinality)
    cross join jsonb_array_elements_text(i.item -> 'copy_ids') with ordinality as c(copy_id, ordinality)
  );
end;
$function$;

REVOKE ALL ON FUNCTION "private"."check_scan_batch"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_scan_batch"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_scan_batch"(jsonb) TO "postgres";
