begin;

do $$
begin
  if not has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION')
    or not has_function_privilege(current_user, 'auth.uid()', 'EXECUTE WITH GRANT OPTION')
    or not has_function_privilege(current_user, 'auth.jwt()', 'EXECUTE WITH GRANT OPTION')
  then
    raise exception using
      errcode = '42501',
      message = 'Reader Auth provisioning requires schema and function grant authority';
  end if;
end;
$$;

grant usage on schema auth to mtgscan_collection_reader;
grant execute on function auth.uid(), auth.jwt() to mtgscan_collection_reader;

do $$
begin
  if not has_schema_privilege('mtgscan_collection_reader', 'auth', 'USAGE')
    or not has_function_privilege('mtgscan_collection_reader', 'auth.uid()', 'EXECUTE')
    or not has_function_privilege('mtgscan_collection_reader', 'auth.jwt()', 'EXECUTE')
  then
    raise exception using
      errcode = '42501',
      message = 'Reader Auth provisioning is incomplete';
  end if;
end;
$$;

commit;
