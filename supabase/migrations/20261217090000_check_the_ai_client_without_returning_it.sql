drop function private.caller_ai_client();

create function private.caller_ai_client()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.jwt() ->> 'client_id' is null then
    raise exception 'Only an AI client can call this function.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
