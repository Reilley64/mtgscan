CREATE OR REPLACE FUNCTION public.add_scan_batch (
  batch jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  copies jsonb;
  new_copy_count integer;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  copies := private.check_scan_batch(batch);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('add_scan_batch ' || caller::text, 0));

  select count(*) into new_copy_count
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    );

  if new_copy_count = 0 then
    return private.scan_batch_result(caller, addition, copies);
  end if;

  insert into public.collection_additions (user_id, added_at, copy_count, source)
    values (caller, now(), new_copy_count, 'scan_batch')
    returning * into addition;

  with new_copies as (
    select c.*
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    )
  ),
  stacks as (
    select n.card_printing_id, n.finish, n.condition, n.language, count(*)::integer as quantity
    from new_copies n
    group by n.card_printing_id, n.finish, n.condition, n.language
  ),
  price_snapshot as (
    select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'prices'
  )
  insert into public.collection_addition_lines (
    addition_id, user_id, card_printing_id, finish, condition, language, quantity,
    purchase_day_usd_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    private.finish_price_cents(price, s.finish),
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  insert into public.collection_addition_copies (
    user_id, copy_id, addition_id, card_printing_id, finish, condition, language
  )
  select caller, c.copy_id, addition.id, c.card_printing_id, c.finish, c.condition, c.language
  from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
  where not exists (
    select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
  );

  insert into public.copies (id, user_id, addition_id, card_printing_id, finish, condition, language)
  select done.copy_id, done.user_id, done.addition_id, done.card_printing_id, done.finish, done.condition, done.language
  from public.collection_addition_copies done
  where done.user_id = caller and done.addition_id = addition.id;

  return private.scan_batch_result(caller, addition, copies);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."add_scan_batch"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."add_scan_batch"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."add_scan_batch"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."add_scan_batch"(jsonb) FROM PUBLIC, "anon", "service_role";
