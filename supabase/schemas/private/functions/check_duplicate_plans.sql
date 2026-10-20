CREATE OR REPLACE FUNCTION private.check_duplicate_plans (
  owner_id   uuid,
  list_field text,
  plans      jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  plan jsonb;
  earlier_index integer;
  open_plan jsonb;
begin
  for plan in select element from jsonb_array_elements(plans) element loop
    select (earlier ->> 'index')::integer into earlier_index
      from jsonb_array_elements(plans) earlier
      where (earlier ->> 'index')::integer < (plan ->> 'index')::integer
        and private.planned_swap_identity(earlier) = private.planned_swap_identity(plan)
      limit 1;
    if earlier_index is not null then
      perform private.invalid_argument(
        format('%s[%s]', list_field, plan ->> 'index'),
        format('%s[%s] repeats %s[%s] in this call.', list_field, plan ->> 'index', list_field, earlier_index)
      );
    end if;
    open_plan := private.open_plan_like(owner_id, plan);
    if open_plan is not null then
      perform private.raise_search_error(
        'duplicate_open',
        format(
          '%s[%s] is the same as an open %s in the deck.',
          list_field,
          plan ->> 'index',
          case when open_plan ? 'planned_swap_id' then 'planned swap' else 'buylist card' end
        ),
        (jsonb_build_object('pointer', format('/%s/%s', list_field, plan ->> 'index')) || open_plan)::text
      );
    end if;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."check_duplicate_plans"(uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_duplicate_plans"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_duplicate_plans"(uuid, text, jsonb) TO "postgres";
