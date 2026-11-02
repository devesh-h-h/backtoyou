-- Keep claims email-compatible while making status changes and claim data
-- database-authorized operations.

do $$
begin
  if to_regclass('public.claims') is null
    or exists (
      select required_column
      from unnest(array[
        'id',
        'item_id',
        'lost_item_id',
        'claimant_email',
        'claim_message',
        'status',
        'created_at'
      ]) as required(required_column)
      where not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'claims'
          and column_name = required.required_column
      )
    )
    or not exists (
      select 1
      from pg_proc
      where oid = to_regprocedure(
        'public.sync_approved_claim_found_item_status()'
      )
    )
    or not exists (
      select 1
      from pg_proc
      where oid = to_regprocedure('public.is_admin()')
    )
  then
    raise exception
      'Cannot harden claims: claims columns and prerequisite functions are required';
  end if;
end;
$$;

alter table public.claims enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'claims'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE', 'SELECT')
  loop
    execute format(
      'drop policy if exists %I on public.claims',
      policy_record.policyname
    );
  end loop;
end;
$$;

create policy "Claimants can submit their own pending claims"
  on public.claims
  for insert
  to authenticated
  with check (
    claimant_email = auth.jwt() ->> 'email'
    and status = 'pending'
    and lost_item_id is not null
    and exists (
      select 1
      from public.lost_items
      where lost_items.id = claims.lost_item_id
        and lost_items.user_email = auth.jwt() ->> 'email'
    )
    and exists (
      select 1
      from public.found_items
      where found_items.id = claims.item_id
        and found_items.status = 'available'
    )
  );

create policy "Claimants can read their claims and admins can read all claims"
  on public.claims
  for select
  to authenticated
  using (
    claimant_email = auth.jwt() ->> 'email'
    or public.is_admin()
  );

create policy "Admins can update claims"
  on public.claims
  for update
  to authenticated
  using (
    public.is_admin()
  )
  with check (
    public.is_admin()
  );

revoke all on table public.claims from anon;
grant select, insert, update on table public.claims to authenticated;

create or replace function public.prevent_claim_data_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.item_id is distinct from old.item_id
    or new.lost_item_id is distinct from old.lost_item_id
    or new.claimant_email is distinct from old.claimant_email
    or new.claim_message is distinct from old.claim_message
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Claim details cannot be changed after submission';
  end if;

  if old.status <> 'pending'
    or new.status not in ('approved', 'rejected')
  then
    raise exception 'Only pending claims can be processed';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_claim_data_changes()
  from public;
grant execute on function public.prevent_claim_data_changes()
  to authenticated;

drop trigger if exists prevent_claim_data_changes on public.claims;
create trigger prevent_claim_data_changes
before update on public.claims
for each row
execute function public.prevent_claim_data_changes();

-- The trigger function is required above. Keep it callable by authenticated
-- claim updates while preventing anonymous direct execution.
do $$
begin
  if to_regprocedure(
    'public.sync_approved_claim_found_item_status()'
  ) is null then
    raise exception
      'Cannot secure claims: approval status trigger function is missing';
  end if;

  execute 'revoke all on function public.sync_approved_claim_found_item_status() from public';
  execute 'grant execute on function public.sync_approved_claim_found_item_status() to authenticated';
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'is_admin'
      and pronargs = 0
  ) then
    execute 'revoke all on function public.is_admin() from public';
    execute 'grant execute on function public.is_admin() to authenticated';
  end if;

  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'get_approved_claim_contacts'
      and pronargs = 0
  ) then
    execute 'revoke all on function public.get_approved_claim_contacts() from public';
    execute 'grant execute on function public.get_approved_claim_contacts() to authenticated';
  end if;
end;
$$;
