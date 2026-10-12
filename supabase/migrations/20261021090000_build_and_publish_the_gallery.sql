create table public.gallery_versions (
  version text primary key check (version ~ '^[0-9]{8}-[0-9a-f]{6}$'),
  manifest jsonb not null,
  uploaded_at timestamptz not null default now(),
  parity_lowest_cosine double precision,
  parity_mean_cosine double precision,
  parity_references integer,
  parity_checked_at timestamptz,
  published_at timestamptz
);

alter table public.gallery_versions enable row level security;

revoke all on table public.gallery_versions from anon, authenticated;
revoke insert, update, delete, truncate on table public.gallery_versions from service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gallery', 'gallery', false, 50000000, array['application/octet-stream', 'application/json']);

create function private.is_published_gallery_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name = 'published.json'
    or exists (
      select 1
      from public.gallery_versions v
      where v.published_at is not null
        and v.version = split_part(object_name, '/', 1)
        and object_name like v.version || '/_%'
    );
$$;

create policy "Signed-in users read published gallery versions"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'gallery' and private.is_published_gallery_object(name));

create function private.gallery_version(version text)
returns public.gallery_versions
language plpgsql
stable
set search_path = ''
as $$
declare
  found_version public.gallery_versions;
begin
  select * into found_version from public.gallery_versions v where v.version = gallery_version.version;
  if not found then
    perform private.raise_search_error(
      'unknown_gallery_version',
      format('Gallery version %s is not recorded.', gallery_version.version),
      'version'
    );
  end if;
  return found_version;
end;
$$;

create function private.gallery_parity_passed(recorded public.gallery_versions)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(recorded.parity_lowest_cosine >= 0.98 and recorded.parity_references >= 24, false);
$$;

create function public.list_gallery_printings(after_id uuid default null)
returns table (id uuid, basic_land boolean)
language sql
stable
set search_path = ''
as $$
  select p.id, private.some_face_has_type_words(c.type_line, array['basic'])
  from public.card_printings p
  join public.cards c on c.oracle_id = p.oracle_id
  where p.absent_since is null
    and (after_id is null or p.id > after_id)
  order by p.id
  limit 1000;
$$;

create function public.record_gallery_version(version text, manifest jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(record_gallery_version.manifest) is distinct from 'object'
    or record_gallery_version.manifest ->> 'version' is distinct from record_gallery_version.version then
    perform private.invalid_argument('manifest', 'manifest must be an object that names the same version.');
  end if;
  begin
    insert into public.gallery_versions (version, manifest)
      values (record_gallery_version.version, record_gallery_version.manifest)
      on conflict do nothing;
  exception when check_violation then
    perform private.invalid_argument('version', 'version must be a build date and a 6-character ID, such as 20261021-a1b2c3.');
  end;
  if not found then
    perform private.invalid_argument('version', format('Gallery version %s is already recorded.', record_gallery_version.version));
  end if;
end;
$$;

create function public.record_gallery_parity(
  version text,
  lowest_cosine double precision,
  mean_cosine double precision,
  reference_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded public.gallery_versions;
begin
  perform private.gallery_version(record_gallery_parity.version);
  if record_gallery_parity.lowest_cosine is null or record_gallery_parity.lowest_cosine not between -1 and 1 then
    perform private.invalid_argument('lowest_cosine', 'lowest_cosine must be a number from -1 to 1.');
  end if;
  if record_gallery_parity.mean_cosine is null
    or record_gallery_parity.mean_cosine not between record_gallery_parity.lowest_cosine and 1.001 then
    perform private.invalid_argument('mean_cosine', 'mean_cosine must be a number from lowest_cosine to 1.001.');
  end if;
  if record_gallery_parity.reference_count is null or record_gallery_parity.reference_count < 1 then
    perform private.invalid_argument('reference_count', 'reference_count must be a whole number of 1 or more.');
  end if;
  update public.gallery_versions v
    set parity_lowest_cosine = record_gallery_parity.lowest_cosine,
      parity_mean_cosine = record_gallery_parity.mean_cosine,
      parity_references = record_gallery_parity.reference_count,
      parity_checked_at = now()
    where v.version = record_gallery_parity.version
    returning * into recorded;
  return private.gallery_parity_passed(recorded);
end;
$$;

create function public.publish_gallery_version(version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded public.gallery_versions;
  published timestamptz := now();
begin
  recorded := private.gallery_version(publish_gallery_version.version);
  if recorded.parity_checked_at is null then
    perform private.raise_search_error(
      'parity_missing',
      format('Gallery version %s has no recorded parity check. Run the parity check on the iPhone first.', recorded.version),
      'version'
    );
  end if;
  if not private.gallery_parity_passed(recorded) then
    perform private.raise_search_error(
      'parity_failed',
      format(
        'The parity check of gallery version %s did not pass: the lowest cosine is %s over %s references. It must be at least 0.98 over 24 or more.',
        recorded.version,
        recorded.parity_lowest_cosine,
        recorded.parity_references
      ),
      'version'
    );
  end if;
  update public.gallery_versions v set published_at = published where v.version = recorded.version;
  return published;
end;
$$;

create function public.delete_gallery_version(version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded public.gallery_versions;
begin
  recorded := private.gallery_version(delete_gallery_version.version);
  if recorded.published_at is not null and recorded.published_at = (
    select max(v.published_at) from public.gallery_versions v
  ) then
    perform private.invalid_argument('version', format('Gallery version %s is the published version.', recorded.version));
  end if;
  delete from public.gallery_versions v where v.version = recorded.version;
end;
$$;

revoke all on function
  private.is_published_gallery_object(text),
  private.gallery_version(text),
  private.gallery_parity_passed(public.gallery_versions)
from public;

grant execute on function private.is_published_gallery_object(text) to authenticated;

revoke all on function
  public.list_gallery_printings(uuid),
  public.record_gallery_version(text, jsonb),
  public.record_gallery_parity(text, double precision, double precision, integer),
  public.publish_gallery_version(text),
  public.delete_gallery_version(text)
from public, anon, authenticated;

grant execute on function
  public.list_gallery_printings(uuid),
  public.record_gallery_version(text, jsonb),
  public.record_gallery_parity(text, double precision, double precision, integer),
  public.publish_gallery_version(text),
  public.delete_gallery_version(text)
to service_role;
