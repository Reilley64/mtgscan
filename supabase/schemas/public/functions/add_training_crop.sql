CREATE OR REPLACE FUNCTION public.add_training_crop (
  request jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  crop public.training_crops;
begin
  checked := private.check_request(request, array['user_id', 'copy_id', 'crop']);
  crop := private.checked_training_crop((checked ->> 'copy_id')::uuid, checked -> 'crop');
  if exists (
    select 1
    from public.profiles p
    where p.user_id = (checked ->> 'user_id')::uuid
      and not p.training_crop_uploads
  ) then
    perform private.raise_search_error('uploads_off', 'Training crop uploads are off for this user.');
  end if;
  if private.storage_left_before_upload_stop() <= 0 then
    perform private.raise_search_error('storage_full', 'Training crop uploads are stopped because Storage is 90% full.');
  end if;
  if not exists (
    select 1
    from public.copies c
    where c.user_id = (checked ->> 'user_id')::uuid
      and c.id = (checked ->> 'copy_id')::uuid
  ) then
    perform private.raise_search_error('unknown_copy', 'The copy is not in the collection.', 'copy_id');
  end if;
  insert into public.training_crops values (crop.*) on conflict (crop_id) do nothing;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."add_training_crop"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."add_training_crop"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."add_training_crop"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."add_training_crop"(jsonb) FROM PUBLIC, "anon", "authenticated";
