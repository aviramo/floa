-- Quit: the Supabase schema. Run once, whole (it is safe to run again):
--   node scripts/sql.mjs < businesses/quit/schema.sql
-- Every row belongs to the account that made it, and the database enforces
-- that, not the browser: the anon key can only ever reach its own user's rows.
-- Two tables, both named for this app, so no other business shares them.

-- A habit the person is quitting. `quit_at` is the moment they stopped; the
-- streak is counted from it, or from the last slip if there was one.
create table if not exists public.quit_habits (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  quit_at       timestamptz not null default now(),

  -- what the habit used to cost, to show what was not spent. Both optional (0).
  cost_per_day  numeric(10, 2) not null default 0 check (cost_per_day >= 0),
  units_per_day numeric(8, 2)  not null default 0 check (units_per_day >= 0),
  unit_label    text not null default '' check (char_length(unit_label) <= 30),

  -- the person's own words, shown back to them when a craving hits
  reason        text not null default '' check (char_length(reason) <= 500),

  created_at    timestamptz not null default now()
);

-- What happened since: a craving that was resisted, or a slip. A slip starts the
-- streak again; neither is ever deleted by the app, only by deleting the habit.
create table if not exists public.quit_events (
  id        uuid primary key default gen_random_uuid(),
  owner     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id  uuid not null references public.quit_habits(id) on delete cascade,
  kind      text not null check (kind in ('craving', 'slip')),
  at        timestamptz not null default now(),
  note      text not null default '' check (char_length(note) <= 500)
);

create index if not exists quit_events_habit_at on public.quit_events (habit_id, at desc);

alter table public.quit_habits enable row level security;
alter table public.quit_events enable row level security;

drop policy if exists "habits are the owner's" on public.quit_habits;
create policy "habits are the owner's" on public.quit_habits
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- An event must also sit on a habit of the same owner, so nobody can write into
-- a habit they do not own even by guessing its id.
drop policy if exists "events are the owner's" on public.quit_events;
create policy "events are the owner's" on public.quit_events
  for all to authenticated
  using (owner = auth.uid())
  with check (
    owner = auth.uid()
    and exists (select 1 from public.quit_habits h where h.id = habit_id and h.owner = auth.uid())
  );
