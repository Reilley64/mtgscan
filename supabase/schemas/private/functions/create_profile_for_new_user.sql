CREATE OR REPLACE FUNCTION private.create_profile_for_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."create_profile_for_new_user"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."create_profile_for_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."create_profile_for_new_user"() TO "postgres";
