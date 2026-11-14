begin;

do $$
declare
  target_role text;
begin
  if not has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION')
    or not has_function_privilege(current_user, 'auth.uid()', 'EXECUTE WITH GRANT OPTION')
    or not has_function_privilege(current_user, 'auth.jwt()', 'EXECUTE WITH GRANT OPTION')
  then
    raise exception using
      errcode = '42501',
      message = 'Runtime Auth provisioning requires schema and function grant authority';
  end if;

  foreach target_role in array array['mtgscan_collection_reader', 'mtgscan_decks']
  loop
    execute format('grant usage on schema auth to %I', target_role);
    execute format('grant execute on function auth.uid(), auth.jwt() to %I', target_role);
    if not has_schema_privilege(target_role, 'auth', 'USAGE')
      or not has_function_privilege(target_role, 'auth.uid()', 'EXECUTE')
      or not has_function_privilege(target_role, 'auth.jwt()', 'EXECUTE')
    then
      raise exception using
        errcode = '42501',
        message = 'Runtime Auth provisioning is incomplete';
    end if;
  end loop;
end;
$$;

commit;
