-- Additive migration: preserves existing claims while requiring a lost report
-- for all future claimant-created claims through the RLS policy below.
alter table public.claims
  add column if not exists lost_item_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'claims_lost_item_id_fkey'
  ) then
    alter table public.claims
      add constraint claims_lost_item_id_fkey
      foreign key (lost_item_id)
      references public.lost_items(id)
      on delete cascade;
  end if;
end;
$$;

alter table public.found_items
  add column if not exists status text;

update public.found_items
set status = 'available'
where status is null;

alter table public.found_items
  alter column status set default 'available',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'found_items_status_check'
  ) then
    alter table public.found_items
      add constraint found_items_status_check
      check (status in ('available', 'claimed', 'returned'));
  end if;
end;
$$;

-- Tighten the existing insert policy without removing it: a claimant can only
-- create a pending claim tied to one of their own lost reports and an
-- available found item.
alter policy "Claimants can submit their own pending claims"
  on public.claims
  with check (
    claimant_email = auth.jwt() ->> 'email'
    and status = 'pending'
    and lost_item_id is not null
    and exists (
      select 1 from public.lost_items
      where lost_items.id = claims.lost_item_id
        and lost_items.user_email = auth.jwt() ->> 'email'
    )
    and exists (
      select 1 from public.found_items
      where found_items.id = claims.item_id
        and found_items.status = 'available'
    )
  );

-- Keep the found item state consistent even if an admin approves a claim from
-- a client other than this UI, and reject a second approval for the same item.
create or replace function public.sync_approved_claim_found_item_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.found_items
    set status = 'claimed'
    where id = new.item_id
      and status = 'available';

    if not found then
      raise exception 'This found item is no longer available for approval';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_approved_claim_found_item_status on public.claims;
create trigger sync_approved_claim_found_item_status
  before update of status on public.claims
  for each row execute function public.sync_approved_claim_found_item_status();

-- Existing deployments may already have a broader admin policy. This policy
-- is deliberately additive and keeps RLS enabled.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'found_items'
      and policyname = 'Admins can update found item status'
  ) then
    create policy "Admins can update found item status"
      on public.found_items
      for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.email = auth.jwt() ->> 'email'
            and profiles.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where profiles.email = auth.jwt() ->> 'email'
            and profiles.role = 'admin'
        )
      );
  end if;
end;
$$;

-- Contact choices belong to the user profile rather than an individual claim.
-- Existing users retain the previous email-contact behaviour; phone and future
-- in-app chat are opt-in. Phone remains nullable until a user supplies it.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists contact_email_enabled boolean default true,
  add column if not exists contact_phone_enabled boolean default false,
  add column if not exists contact_in_app_chat_enabled boolean default false;

update public.profiles
set
  contact_email_enabled = coalesce(contact_email_enabled, true),
  contact_phone_enabled = coalesce(contact_phone_enabled, false),
  contact_in_app_chat_enabled = coalesce(contact_in_app_chat_enabled, false)
where contact_email_enabled is null
   or contact_phone_enabled is null
   or contact_in_app_chat_enabled is null;

alter table public.profiles
  alter column contact_email_enabled set default true,
  alter column contact_email_enabled set not null,
  alter column contact_phone_enabled set default false,
  alter column contact_phone_enabled set not null,
  alter column contact_in_app_chat_enabled set default false,
  alter column contact_in_app_chat_enabled set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_not_blank'
  ) then
    alter table public.profiles
      add constraint profiles_phone_not_blank
      check (phone is null or char_length(trim(phone)) > 0);
  end if;
end;
$$;

-- This function returns contact information only for an approved claim owned
-- by the caller or an approved claim on a found report owned by the caller.
-- It respects each profile's contact preferences and prepares the response for
-- a future in-app chat implementation without creating chat records yet.
create or replace function public.get_approved_claim_contacts()
returns table (
  claim_id bigint,
  lost_item_name text,
  found_item_name text,
  claimant_email text,
  claimant_phone text,
  claimant_allows_in_app_chat boolean,
  finder_email text,
  finder_phone text,
  finder_allows_in_app_chat boolean,
  item_status text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    l.item_name,
    f.item_name,
    case
      when coalesce(claimant_profile.contact_email_enabled, true)
        then c.claimant_email
    end,
    case
      when coalesce(claimant_profile.contact_phone_enabled, false)
        then claimant_profile.phone
    end,
    coalesce(claimant_profile.contact_in_app_chat_enabled, false),
    case
      when coalesce(finder_profile.contact_email_enabled, true)
        then f.user_email
    end,
    case
      when coalesce(finder_profile.contact_phone_enabled, false)
        then finder_profile.phone
    end,
    coalesce(finder_profile.contact_in_app_chat_enabled, false),
    f.status
  from public.claims c
  join public.lost_items l on l.id = c.lost_item_id
  join public.found_items f on f.id = c.item_id
  left join lateral (
    select
      p.phone,
      p.contact_email_enabled,
      p.contact_phone_enabled,
      p.contact_in_app_chat_enabled
    from public.profiles p
    where p.email = c.claimant_email
    order by p.created_at desc nulls last
    limit 1
  ) claimant_profile on true
  left join lateral (
    select
      p.phone,
      p.contact_email_enabled,
      p.contact_phone_enabled,
      p.contact_in_app_chat_enabled
    from public.profiles p
    where p.email = f.user_email
    order by p.created_at desc nulls last
    limit 1
  ) finder_profile on true
  where c.status = 'approved'
    and (
      c.claimant_email = auth.jwt() ->> 'email'
      or f.user_email = auth.jwt() ->> 'email'
    );
$$;

revoke all on function public.get_approved_claim_contacts() from public;
grant execute on function public.get_approved_claim_contacts() to authenticated;
