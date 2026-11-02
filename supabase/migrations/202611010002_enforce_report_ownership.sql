-- Enforce ownership for the email-based report schema used by the client.
-- This migration intentionally does not add a user_id column: the repository
-- schema and application queries currently use user_email.

do $$
begin
  if to_regclass('public.lost_items') is null
    or to_regclass('public.found_items') is null
    or to_regclass('public.profiles') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lost_items'
        and column_name = 'user_email'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'found_items'
        and column_name = 'user_email'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'found_items'
        and column_name = 'status'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'email'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    )
  then
    raise exception
      'Cannot secure reports: lost_items, found_items, profiles, and required ownership columns are required';
  end if;
end;
$$;

alter table public.lost_items enable row level security;
alter table public.found_items enable row level security;

-- Resolve the role from the database, not from a client-supplied profile
-- object. SECURITY DEFINER is required because profile RLS may hide the
-- administrator's row from a report policy subquery.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.email = auth.jwt() ->> 'email'
      and profiles.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Replace every policy, including FOR ALL policies. Permissive policies
-- combine with OR semantics, so retaining an unrelated FOR ALL policy would
-- bypass these ownership checks. The explicit policies below preserve the
-- authenticated browse/read behavior used by the application.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('lost_items', 'found_items')
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE', 'SELECT')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

drop policy if exists "Authenticated users can read lost reports"
  on public.lost_items;
create policy "Authenticated users can read lost reports"
  on public.lost_items
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own lost reports"
  on public.lost_items;
create policy "Users can create their own lost reports"
  on public.lost_items
  for insert
  to authenticated
  with check (user_email = auth.jwt() ->> 'email');

drop policy if exists "Users can update their own lost reports"
  on public.lost_items;
create policy "Users can update their own lost reports"
  on public.lost_items
  for update
  to authenticated
  using (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  )
  with check (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  );

drop policy if exists "Users can delete their own lost reports"
  on public.lost_items;
create policy "Users can delete their own lost reports"
  on public.lost_items
  for delete
  to authenticated
  using (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  );

drop policy if exists "Authenticated users can read found reports"
  on public.found_items;
create policy "Authenticated users can read found reports"
  on public.found_items
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own found reports"
  on public.found_items;
create policy "Users can create their own found reports"
  on public.found_items
  for insert
  to authenticated
  with check (
    user_email = auth.jwt() ->> 'email'
    and status = 'available'
  );

drop policy if exists "Users can update their own found reports"
  on public.found_items;
create policy "Users can update their own found reports"
  on public.found_items
  for update
  to authenticated
  using (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  )
  with check (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  );

drop policy if exists "Users can delete their own found reports"
  on public.found_items;
create policy "Users can delete their own found reports"
  on public.found_items
  for delete
  to authenticated
  using (
    user_email = auth.jwt() ->> 'email'
    or public.is_admin()
  );

revoke all on table public.lost_items, public.found_items from anon;
grant select, insert, update, delete
  on table public.lost_items, public.found_items
  to authenticated;

create or replace function public.prevent_report_authorization_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_admin()
  then
    return new;
  end if;

  if new.user_email is distinct from old.user_email then
    raise exception 'Report ownership cannot be changed through self-service updates';
  end if;

  if tg_table_name = 'found_items'
    and new.status is distinct from old.status
  then
    raise exception 'Found item status cannot be changed through self-service updates';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_report_authorization_field_changes()
  from public;
grant execute on function public.prevent_report_authorization_field_changes()
  to authenticated;

drop trigger if exists prevent_lost_report_authorization_field_changes
  on public.lost_items;
create trigger prevent_lost_report_authorization_field_changes
before update of user_email on public.lost_items
for each row
execute function public.prevent_report_authorization_field_changes();

drop trigger if exists prevent_found_report_authorization_field_changes
  on public.found_items;
create trigger prevent_found_report_authorization_field_changes
before update of user_email, status on public.found_items
for each row
execute function public.prevent_report_authorization_field_changes();
