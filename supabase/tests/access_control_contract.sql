begin;

-- The browser-facing Supabase roles must never read or mutate application data
-- directly. Server-only code is the sole application data boundary.
do $$
declare
  protected_table record;
begin
  for protected_table in
    select c.oid, c.relname, c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    if not protected_table.relrowsecurity then
      raise exception 'Public table % must have row-level security enabled.', protected_table.relname;
    end if;

    if has_table_privilege('anon', protected_table.oid, 'select')
      or has_table_privilege('anon', protected_table.oid, 'insert')
      or has_table_privilege('anon', protected_table.oid, 'update')
      or has_table_privilege('anon', protected_table.oid, 'delete')
      or has_table_privilege('authenticated', protected_table.oid, 'select')
      or has_table_privilege('authenticated', protected_table.oid, 'insert')
      or has_table_privilege('authenticated', protected_table.oid, 'update')
      or has_table_privilege('authenticated', protected_table.oid, 'delete') then
      raise exception 'Browser roles must not have table access to public.%.', protected_table.relname;
    end if;
  end loop;

  if has_schema_privilege('anon', 'app_private', 'usage')
    or has_schema_privilege('authenticated', 'app_private', 'usage') then
    raise exception 'Browser roles must not access the app_private schema.';
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'Browser roles must not execute public database routines.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  ) then
    raise exception 'Public database routines must not be SECURITY DEFINER.';
  end if;
end;
$$;

rollback;
