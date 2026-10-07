-- Jobs: the Supabase schema. Run once, whole, in the SQL editor
-- (or: node scripts/sql.mjs < businesses/jobs/schema.sql).
-- Everyone may read published jobs; only a signed-in user may change anything.

create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  company     text not null default '',
  location    text not null default '',
  description text not null default '',
  apply_url   text not null default '',
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.jobs enable row level security;

drop policy if exists "jobs read published" on public.jobs;
create policy "jobs read published" on public.jobs
  for select using (published or auth.uid() is not null);

drop policy if exists "jobs write signed in" on public.jobs;
create policy "jobs write signed in" on public.jobs
  for all to authenticated using (true) with check (true);
