-- Jobs: the Supabase schema. Run once, whole:
--   node scripts/sql.mjs < businesses/jobs/schema.sql
-- Every row belongs to the account that made it, and the database enforces
-- that, not the browser: the anon key can only ever reach its own user's rows.

drop table if exists public.jobs;  -- the placeholder board from the first scaffold

create table if not exists public.job_agents (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default 'סוכן חדש',

  -- the uploaded CV, in the private bucket "job-cvs", under <owner>/<file>
  cv_path     text not null default '',
  cv_name     text not null default '',
  -- what was read from it: headline, years_experience, skills, languages, city, summary
  profile     jsonb not null default '{}'::jsonb,

  -- what the person is looking for
  roles       text[] not null default '{}',
  city        text not null default '',
  radius_km   int not null default 20 check (radius_km between 0 and 300),

  created_at  timestamptz not null default now()
);

alter table public.job_agents enable row level security;

drop policy if exists "agents are the owner's" on public.job_agents;
create policy "agents are the owner's" on public.job_agents
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- Private storage for the CVs: a folder per account, and only that account in it.
insert into storage.buckets (id, name, public)
values ('job-cvs', 'job-cvs', false)
on conflict (id) do nothing;

drop policy if exists "cvs are the owner's" on storage.objects;
create policy "cvs are the owner's" on storage.objects
  for all to authenticated
  using (bucket_id = 'job-cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'job-cvs' and (storage.foldername(name))[1] = auth.uid()::text);
