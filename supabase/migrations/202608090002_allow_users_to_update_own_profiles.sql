-- The application identifies profiles by authenticated email rather than a
-- user_id column. Keep RLS intact and allow an authenticated user to update
-- only the row whose email matches their JWT email.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
      on public.profiles
      for update
      to authenticated
      using (email = auth.jwt() ->> 'email')
      with check (email = auth.jwt() ->> 'email');
  end if;
end;
$$;
