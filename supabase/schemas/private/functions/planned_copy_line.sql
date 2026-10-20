CREATE OR REPLACE FUNCTION private.planned_copy_line (
  owner_id       uuid,
  line_copy_id   uuid,
  line_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'kind', 'copy',
    'copy_id', line_copy_id,
    'name', card.name,
    'image_uris', coalesce(to_jsonb(printing.image_uris), '[]'::jsonb),
    'type_line', card.type_line,
    'set', printing.set_code,
    'collector_number', printing.collector_number,
    'finish', copy.finish,
    'condition', copy.condition
  )
  from public.cards card
  left join public.copies copy on copy.user_id = owner_id and copy.id = line_copy_id
  left join public.card_printings printing on printing.id = copy.card_printing_id
  where card.oracle_id = line_oracle_id;
$function$;

GRANT EXECUTE ON FUNCTION "private"."planned_copy_line"(uuid, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."planned_copy_line"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_copy_line"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_copy_line"(uuid, uuid, uuid) TO "postgres";
