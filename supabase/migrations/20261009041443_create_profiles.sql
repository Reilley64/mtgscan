create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "Users read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create schema private;

revoke all on schema private from public, anon, authenticated;

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;

create trigger create_profile_after_sign_up
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();
