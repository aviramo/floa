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
  --   "ש[Am]לום לך אדו[G]ני\nו[F]איך היה היום\n\n{פזמון}\n..."
  --
  -- A CHORD SITS ON A CHARACTER, and its brackets go immediately AFTER that
  -- character: ABC[Am]DEF means the Am is on the C. Not on the seam between
  -- two characters. A printed sheet puts the symbol over a letter and marks
  -- that letter with a tick, so a position naming a gap was describing the
  -- drawing rather than the song.
  --
  -- A heading is a line in braces; a newline is a newline.
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

  -- 'ready' unless a picture of it is waiting to be read or being read.
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

-- What the reading cost, in US cents, counted from the token usage the model
-- reports and written by the Worker when it saves. Null on a song nobody paid
-- to read: one typed by hand, or one read before this column existed.
alter table public.songs add column if not exists read_cost   numeric;

-- Dropped and recreated rather than added, because 'queued' arrived after the
-- first version of this constraint and an "add if it is not there" would leave
-- the old one in place and refuse every queued row.
alter table public.songs drop constraint if exists songs_status_check;
alter table public.songs add constraint songs_status_check
  check (status in ('queued', 'ready', 'reading', 'failed'));

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

-- ==========================================================================
-- Evenings of singing.
--
-- A name, a date, and songs in the order they will be sung. A table of its
-- own rather than a column on a song, because the two do not belong to each
-- other: a song does not know which evenings it is in, and an evening whose
-- song was deleted from the library is still an evening.
-- ==========================================================================

create table if not exists public.setlists (
  id          uuid primary key default gen_random_uuid(),

  -- May be empty. An evening usually gets its songs before it gets its name,
  -- and refusing to save one until it is named would mean losing the songs.
  title       text not null default '',

  -- A DAY, not a moment. An evening happens on a date, nobody plans one to
  -- the second, and a timestamp would drag a timezone in behind it.
  event_date  date,

  -- Where. Free text, because the answer is "אצל דנה", "מועדון הזמר" or a
  -- street address depending on the evening, and a form that insisted on one
  -- of them would be wrong about the other two.
  venue       text not null default '',

  -- The songs, in order:  [{"id": "…", "title": "…"}, …]
  --
  -- The id is what a row is drawn from: the title, the credits and the chords
  -- are read live out of the library, so renaming a song renames it wherever
  -- it appears. The title stored beside the id is not a copy of that, it is
  -- what is left when the song itself has been deleted, and "the song that
  -- was here is gone" reads better than a blank line.
  --
  -- An array rather than a row per song with a position column, because the
  -- order IS the point and an array already has one. A column of positions is
  -- a set of numbers somebody has to keep true across every drag.
  songs       jsonb not null default '[]'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- added after the first version of this table; safe to re-run
alter table public.setlists add column if not exists venue text not null default '';

drop trigger if exists setlists_touch_updated_at on public.setlists;
create trigger setlists_touch_updated_at
  before update on public.setlists
  for each row execute function public.touch_updated_at();

-- Same rule as the songs, for the same reason: the anon key printed in the
-- page may read and nothing else.
alter table public.setlists enable row level security;

drop policy if exists "evenings are readable by everyone" on public.setlists;
create policy "evenings are readable by everyone"
  on public.setlists for select
  using (true);

drop policy if exists "signed in users may add evenings" on public.setlists;
create policy "signed in users may add evenings"
  on public.setlists for insert to authenticated
  with check (true);

drop policy if exists "signed in users may edit evenings" on public.setlists;
create policy "signed in users may edit evenings"
  on public.setlists for update to authenticated
  using (true) with check (true);

drop policy if exists "signed in users may delete evenings" on public.setlists;
create policy "signed in users may delete evenings"
  on public.setlists for delete to authenticated
  using (true);
