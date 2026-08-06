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

  -- Who made it, which is two different people as often as it is one. The
  -- performer is deliberately not among them: a song is one song however many
  -- people have recorded it.
  lyrics_by   text not null default '',
  music_by    text not null default '',

  -- Kept, read by nothing. `artist` held a performer and `song_key` a key, and
  -- both were dropped from the app rather than from the table, because a
  -- column that is not read costs nothing and a column that is dropped takes
  -- whatever was typed into it with it.
  artist      text not null default '',
  song_key    text not null default '',

  -- 'rtl' for a Hebrew song, 'ltr' for an English one. Per song, because a
  -- single index holds both.
  dir         text not null default 'rtl' check (dir in ('rtl', 'ltr')),

  -- The song itself, as ONE piece of text, in the ChordPro convention:
  --
  --   "[Am]שלום לך אדו[G]ני\n[F]ואיך היה היום\n\n{פזמון}\n..."
  --
  -- A chord sits in square brackets immediately before the character it is
  -- printed above; a heading is a line in braces; a newline is a newline.
  --
  -- Stored this way rather than as text plus a list of offsets because then
  -- the link between a chord and its syllable is not a number anyone has to
  -- keep true: the chord is INSIDE the words. Type a space before a word and
  -- the chord moves with it because it cannot do anything else. It is also
  -- readable straight out of the database, and pastes into any other program
  -- that speaks ChordPro.
  --
  -- The column is jsonb and holds a JSON string. Songs written before this,
  -- as an array of line objects, are still read correctly by the app.
  lines       jsonb not null default '""'::jsonb,

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
alter table public.songs add column if not exists lyrics_by   text not null default '';
alter table public.songs add column if not exists music_by    text not null default '';

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
