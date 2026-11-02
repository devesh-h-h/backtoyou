-- Prevent self-service profile updates from changing authorization or identity
-- fields. Role administration remains outside the user-facing client.
do $$
begin
  if to_regclass('public.profiles') is null
    or exists (
      select required_column
      from unnest(array['email', 'role']) as required(required_column)
      where not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = required.required_column
      )
    )
  then
    raise exception
      'Cannot secure profiles: public.profiles.email and public.profiles.role are required';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'ALL'
  ) then
    raise exception
      'Cannot secure profiles: reconcile existing FOR ALL policy before applying profile protection';
  end if;
end;
$$;

create or replace function public.prevent_profile_authorization_field_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Role changes are reserved for a trusted server-side administrator.
  -- Browser sessions, including authenticated administrators, must not be
  -- able to change authorization or identity fields through this trigger.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Profile role cannot be changed through self-service updates';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Profile email cannot be changed through self-service updates';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_authorization_field_changes()
  from public;
grant execute on function public.prevent_profile_authorization_field_changes()
  to authenticated;

drop trigger if exists prevent_profile_authorization_field_changes
  on public.profiles;

create trigger prevent_profile_authorization_field_changes
before update of role, email on public.profiles
for each row
execute function public.prevent_profile_authorization_field_changes();

-- Profile creation is part of the authenticated login workflow. Do not allow
-- anonymous clients to create arbitrary profiles or choose an admin role.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('INSERT', 'ALL')
  loop
    execute format(
      'drop policy if exists %I on public.profiles',
      policy_record.policyname
    );
  end loop;
end;
$$;

create policy "Authenticated users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (
    email = auth.jwt() ->> 'email'
    and role = 'user'
  );
