do $$
begin
  if not exists (select from pg_roles where rolname = 'catalog_importer') then
    execute 'create role catalog_importer nologin noinherit';
    execute 'grant catalog_importer to postgres';
  end if;
  if not exists (select from pg_roles where rolname = 'deck_evaluator') then
    execute 'create role deck_evaluator nologin noinherit';
    execute 'grant deck_evaluator to postgres';
  end if;
end
$$;
