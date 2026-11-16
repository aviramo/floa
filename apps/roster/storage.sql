-- Roster media (meeting pictures, arrival-instruction photos and videos): one bucket per environment and a folder per business,
-- so the test files never mix with the real ones and one business never sees another's folder for writing.
--   production: bucket roster-media        (schema roster)        test: bucket roster-test-media   (schema "roster-test")
-- Object path: <business uuid>/<file>. Public read (the links go into pages and mails); write and delete only for who may open that business.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('roster-media', 'roster-media', true, 52428800)
  on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "roster media write"  on storage.objects;
drop policy if exists "roster media update" on storage.objects;
drop policy if exists "roster media delete" on storage.objects;
create policy "roster media write"  on storage.objects for insert to authenticated
  with check (bucket_id = 'roster-media' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and roster.can(((storage.foldername(name))[1])::uuid));
create policy "roster media update" on storage.objects for update to authenticated
  using (bucket_id = 'roster-media' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and roster.can(((storage.foldername(name))[1])::uuid));
create policy "roster media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'roster-media' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and roster.can(((storage.foldername(name))[1])::uuid));
