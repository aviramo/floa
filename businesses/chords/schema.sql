-- ==========================================================================
-- Chords — the Supabase schema.
--
-- Run this once, whole, in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- One table. Everyone may read it, only a signed-in user may change it, and
-- that rule is enforced by the database rather than by the browser: the anon
-- key that ships in the page can select and nothing else.
-- ==========================================================================

create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),

  -- the URL: floa.co.il/chords/<slug>. Hebrew is fine here.
  slug        text not null unique,

  title       text not null,
  artist      text not null default '',
  song_key    text not null default '',

  -- 'rtl' for a Hebrew song, 'ltr' for an English one. Per song, because a
  -- single index holds both.
  dir         text not null default 'rtl' check (dir in ('rtl', 'ltr')),

  -- the song itself:
  --   [{ "type": "line",    "text": "אני שר",  "chords": [{"pos": 0, "chord": "Am"}] },
  --    { "type": "section", "text": "פזמון",   "chords": [] }]
  -- `pos` is a character index into `text`, never a pixel and never a column.
  -- That is what keeps a chord over the same syllable at every font size, and
  -- what makes right-to-left no different from left-to-right.
  lines       jsonb not null default '[]'::jsonb,

  -- 'ready' unless a picture of it is still being read.
  --
  -- Reading a photo takes a minute or two and it happens in the Worker, not in
  -- the browser, so the row is created first and filled in when the reading
  -- lands. That is what lets you close the tab and come back to a finished
  -- song, and what makes a half-read song visible instead of invisible.
  status      text not null default 'ready',
  status_note text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- added after the first version of this file; safe to re-run
alter table public.songs add column if not exists status      text not null default 'ready';
alter table public.songs add column if not exists status_note text not null default '';

do $$ begin
  alter table public.songs add constraint songs_status_check
    check (status in ('ready', 'reading', 'failed'));
exception when duplicate_object then null;
end $$;

-- the index page sorts by title
create index if not exists songs_title_idx on public.songs (title);

-- updated_at that cannot be forgotten
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Row level security.
--
-- Without this every visitor holding the anon key (which is every visitor,
-- it is printed in the page) could delete the whole library.
-- --------------------------------------------------------------------------
alter table public.songs enable row level security;

drop policy if exists "songs are readable by everyone" on public.songs;
create policy "songs are readable by everyone"
  on public.songs for select
  using (true);

drop policy if exists "signed in users may add songs" on public.songs;
create policy "signed in users may add songs"
  on public.songs for insert to authenticated
  with check (true);

drop policy if exists "signed in users may edit songs" on public.songs;
create policy "signed in users may edit songs"
  on public.songs for update to authenticated
  using (true) with check (true);

drop policy if exists "signed in users may delete songs" on public.songs;
create policy "signed in users may delete songs"
  on public.songs for delete to authenticated
  using (true);
