-- Run in Supabase SQL Editor (project mapswtriwoxlscjdakpk)
-- Fixes 403 "row violates row-level security policy" when developers save apps / screenshots

-- 1) Profiles: own row update
alter table public.profiles add column if not exists browser_id text;
create index if not exists idx_profiles_browser_id on public.profiles (browser_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) Apps: select / update / insert for developer or store owner
drop policy if exists "devs_select_own_apps" on public.apps;
create policy "devs_select_own_apps"
  on public.apps for select to authenticated
  using (
    dev_id = auth.uid()
    or status = 'approved'
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

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
  with check (
    dev_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- 3) Screenshots table
drop policy if exists "devs_manage_screenshots" on public.app_screenshots;
create policy "devs_manage_screenshots"
  on public.app_screenshots for all to authenticated
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_id
        and (
          a.dev_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
        )
    )
  )
  with check (
    exists (
      select 1 from public.apps a
      where a.id = app_id
        and (
          a.dev_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
        )
    )
  );

-- Public read screenshots (storefront)
drop policy if exists "public_read_screenshots" on public.app_screenshots;
create policy "public_read_screenshots"
  on public.app_screenshots for select to anon, authenticated
  using (true);

-- 4) App bits
drop policy if exists "devs_manage_bits" on public.app_bits;
create policy "devs_manage_bits"
  on public.app_bits for all to authenticated
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_id
        and (
          a.dev_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
        )
    )
  )
  with check (
    exists (
      select 1 from public.apps a
      where a.id = app_id
        and (
          a.dev_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
        )
    )
  );

-- 5) STORAGE buckets (this is what usually causes statusCode 403 AccessDenied on Save)
-- Ensure buckets exist and are public-read for logos/screenshots
insert into storage.buckets (id, name, public)
values
  ('nexastore-logos', 'nexastore-logos', true),
  ('nexastore-screenshots', 'nexastore-screenshots', true),
  ('nexastore-bits', 'nexastore-bits', false)
on conflict (id) do update set public = excluded.public;

-- Drop old restrictive policies if present
drop policy if exists "logos_public_read" on storage.objects;
drop policy if exists "screenshots_public_read" on storage.objects;
drop policy if exists "auth_upload_logos" on storage.objects;
drop policy if exists "auth_update_logos" on storage.objects;
drop policy if exists "auth_upload_screenshots" on storage.objects;
drop policy if exists "auth_update_screenshots" on storage.objects;
drop policy if exists "auth_upload_bits" on storage.objects;
drop policy if exists "auth_update_bits" on storage.objects;
drop policy if exists "auth_delete_screenshots" on storage.objects;
drop policy if exists "auth_delete_logos" on storage.objects;

create policy "logos_public_read"
  on storage.objects for select to public
  using (bucket_id = 'nexastore-logos');

create policy "screenshots_public_read"
  on storage.objects for select to public
  using (bucket_id = 'nexastore-screenshots');

create policy "auth_upload_logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'nexastore-logos');

create policy "auth_update_logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'nexastore-logos')
  with check (bucket_id = 'nexastore-logos');

create policy "auth_delete_logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'nexastore-logos');

create policy "auth_upload_screenshots"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'nexastore-screenshots');

create policy "auth_update_screenshots"
  on storage.objects for update to authenticated
  using (bucket_id = 'nexastore-screenshots')
  with check (bucket_id = 'nexastore-screenshots');

create policy "auth_delete_screenshots"
  on storage.objects for delete to authenticated
  using (bucket_id = 'nexastore-screenshots');

create policy "auth_upload_bits"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'nexastore-bits');

create policy "auth_update_bits"
  on storage.objects for update to authenticated
  using (bucket_id = 'nexastore-bits')
  with check (bucket_id = 'nexastore-bits');
