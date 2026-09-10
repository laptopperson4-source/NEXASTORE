-- Run in Supabase SQL Editor (project mapswtriwoxlscjdakpk)

-- 1) Permanent browser id on profiles (shown after login)
alter table public.profiles add column if not exists browser_id text;
create index if not exists idx_profiles_browser_id on public.profiles (browser_id);

-- Allow users to update their own browser_id / profile fields
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) Developers can update / select their own apps (fixes 403 RLS on Save changes)
drop policy if exists "devs_select_own_apps" on public.apps;
create policy "devs_select_own_apps"
  on public.apps for select to authenticated
  using (dev_id = auth.uid() or status = 'approved' or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true
  ));

drop policy if exists "devs_update_own_apps" on public.apps;
create policy "devs_update_own_apps"
  on public.apps for update to authenticated
  using (
    dev_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  )
  with check (
    dev_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "devs_insert_apps" on public.apps;
create policy "devs_insert_apps"
  on public.apps for insert to authenticated
  with check (dev_id = auth.uid());

-- 3) Screenshots owned via app.dev_id
drop policy if exists "devs_manage_screenshots" on public.app_screenshots;
create policy "devs_manage_screenshots"
  on public.app_screenshots for all to authenticated
  using (
    exists (select 1 from public.apps a where a.id = app_id and (a.dev_id = auth.uid() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true
    )))
  )
  with check (
    exists (select 1 from public.apps a where a.id = app_id and (a.dev_id = auth.uid() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true
    )))
  );

-- 4) App bits same pattern
drop policy if exists "devs_manage_bits" on public.app_bits;
create policy "devs_manage_bits"
  on public.app_bits for all to authenticated
  using (
    exists (select 1 from public.apps a where a.id = app_id and (a.dev_id = auth.uid() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true
    )))
  )
  with check (
    exists (select 1 from public.apps a where a.id = app_id and (a.dev_id = auth.uid() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true
    )))
  );

-- 5) Storage: allow authenticated upsert into logo / screenshot / bits buckets
-- (Storage → Policies in dashboard if these fail; buckets must exist)

-- store_visits already uses anon insert; ensure visitor_id column exists
alter table public.store_visits add column if not exists visitor_id text;
