alter default privileges for role postgres revoke execute on functions from public;

revoke execute on all functions in schema private from public;

grant execute on function private.checked_user_tag_names(text, jsonb) to service_role;
